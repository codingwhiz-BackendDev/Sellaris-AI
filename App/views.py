from django.shortcuts import render, redirect
from django.contrib.auth import get_user_model, login as auth_login 
from django.contrib.auth.models import auth
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.contrib import messages
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django_ratelimit.decorators import ratelimit
from .tokens import email_verification_token, password_reset_token
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
import json
import requests
from decimal import Decimal, InvalidOperation
from django.conf import settings
import urllib.parse
from django.http import JsonResponse 
from .models import (
    OnboardingProgress, BusinessProfile, MessagingChannel,
    AIConfig, FAQEntry, Product, TeamMember, NotificationSettings
)

# Create your views here.
def index(request):
    return render(request, 'index.html')


def register(request):
    if request.method == 'POST':
        first_name = request.POST.get('first_name', '').strip()
        last_name  = request.POST.get('last_name', '').strip()
        email      = request.POST.get('email', '').strip().lower()
        password   = request.POST.get('password', '').strip()
        password2  = request.POST.get('confirm_password', '').strip()

        # Validation
        if not first_name or not last_name:
            messages.error(request, "First and last name are required.")
            return render(request, 'register.html')

        if not email:
            messages.error(request, "Email address is required.")
            return render(request, 'register.html')

        if not password or not password2:
            messages.error(request, "Please fill in both password fields.")
            return render(request, 'register.html')

        try:
            validate_email(email)
        except ValidationError:
            messages.error(request, "Please enter a valid email address.")
            return render(request, 'register.html')

        if len(password) < 8:
            messages.error(request, "Password must be at least 8 characters.")
            return render(request, 'register.html')

        if password != password2:
            messages.error(request, "Passwords do not match.")
            return render(request, 'register.html')

        if User.objects.filter(email=email).exists():
            messages.error(request, "An account with that email already exists.")
            return render(request, 'register.html')

        # Username generation
        base_username = f"{first_name}_{last_name}".lower()
        username = base_username
        counter = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{counter}"
            counter += 1

        # Create user FIRST (inactive)
        user = User.objects.create(
            username=username,
            first_name=first_name,
            last_name=last_name,
            email=email,
            password=make_password(password),
            is_active=False,
        )

        try:
            domain = get_current_site(request).domain
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = email_verification_token.make_token(user)

            verification_link = f"http://{domain}/verify-email/{uid}/{token}/"

            send_mail(
                subject="Verify your Sellaris AI account",
                message=(
                    f"Welcome to Sellaris AI!\n\n"
                    f"Click the link below to verify your email:\n\n"
                    f"{verification_link}\n\n"
                    f"This link expires in 24 hours."
                ),
                from_email="noreply@orionlabs.com",
                recipient_list=[email],
                fail_silently=False,
            )

        except BadHeaderError:
            user.delete()
            messages.error(request, "Invalid email header.")
            return render(request, 'register.html')

        except Exception: 
            user.delete()
            messages.error(request, "Email address does not exist or could not receive mail.")
            return render(request, 'register.html')

        return render(request, 'verify_pending.html', {'email': email})

    return render(request, 'register.html')


# ─────────────────────────────────────────────
# EMAIL VERIFICATION
# ─────────────────────────────────────────────
def verify_email(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except Exception:
        return render(request, 'verify_result.html', {
            'status': 'invalid',
            'heading': 'Invalid link',
            'message': 'Verification link is invalid.',
        })

    if email_verification_token.check_token(user, token):
        user.is_active = True
        user.is_email_verified = True
        user.save()

        return render(request, 'verify_result.html', {
            'status': 'success',
            'heading': 'Email verified',
            'message': 'Your account is now active.',
        })

    return render(request, 'verify_result.html', {
        'status': 'expired',
        'heading': 'Link expired',
        'message': 'Verification link expired.',
    })
    
# ─────────────────────────────────────────────
#  LOGIN  (email + password)
# ─────────────────────────────────────────────

@ratelimit(key='ip', rate='10/m', block=True)
def login(request):
    # Already authenticated — skip the login page
    if request.user.is_authenticated:
        return redirect('onboarding')
 
    if request.method == 'POST':
        email    = request.POST.get('email', '').strip().lower()
        password = request.POST.get('password', '').strip()
 
        # Both fields required
        if not email or not password:
            messages.error(request, "Please enter your email and password.")
            return render(request, 'login.html')
 
        # Find user by email
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            messages.error(request, "No account found with that email address.")
            return render(request, 'login.html')
 
        # Account not yet verified
        if not user.is_active:
            messages.error(request, "Please verify your email before signing in.")
            return render(request, 'login.html')
 
        # Wrong password
        if not user.check_password(password):
            messages.error(request, "Incorrect password. Please try again.")
            return render(request, 'login.html')
 
        # Success — create session
        auth_login(request, user, backend='django.contrib.auth.backends.ModelBackend')
        return redirect('dashboard')
 
    return render(request, 'login.html')
 
def logout(request):
    auth.logout(request)
    return redirect('login')

# ─────────────────────────────────────────────
# RESEND VERIFICATION
# ─────────────────────────────────────────────
def resend_verification(request):
    if request.method != 'POST':
        return redirect('register')

    email = request.POST.get('email', '').strip().lower()

    try:
        user = User.objects.get(email=email, is_active=False)
    except User.DoesNotExist:
        return render(request, 'verify_pending.html', {'email': email})

    try:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = email_verification_token.make_token(user)
        domain = get_current_site(request).domain

        verification_link = f"http://{domain}/verify-email/{uid}/{token}/"

        send_mail(
            "Verify your Sellaris AI account",
            f"Click here to verify:\n{verification_link}",
            "noreply@orionlabs.com",
            [email],
            fail_silently=False,
        )

    except Exception:
        messages.error(request, "Could not resend email.")
        return render(request, 'verify_pending.html', {'email': email})

    return render(request, 'verify_pending.html', {'email': email, 'resent': True})

def logout(request):
    auth.logout(request)
    return redirect('login')

def forgot_password(request):
    if request.method == "POST":
        email = request.POST.get("email", "").strip().lower()

        if not email:
            messages.error(request, "Please enter your email.")
            return render(request, "forgot_password.html")

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            messages.error(request, "No account found with that email.")
            return render(request, "forgot_password.html")

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = password_reset_token.make_token(user)
        domain = get_current_site(request).domain

        reset_link = f"http://{domain}/reset-password/{uid}/{token}/"

        send_mail(
            "Reset your Sellaris AI password",
            f"Click the link below to reset your password:\n\n{reset_link}",
            "noreply@orionlabs.com",
            [email],
            fail_silently=False,
        )

        return render(request, "reset_email_sent.html", {"email": email})

    return render(request, "forgot_password.html")

def reset_password(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except Exception:
        return render(request, "reset_result.html", {
            "status": "invalid",
            "message": "Invalid reset link."
        })

    if not password_reset_token.check_token(user, token):
        return render(request, "reset_result.html", {
            "status": "expired",
            "message": "Reset link expired."
        })

    if request.method == "POST":
        password = request.POST.get("password", "").strip()
        confirm = request.POST.get("confirm_password", "").strip()

        if len(password) < 8:
            messages.error(request, "Password must be at least 8 characters.")
            return render(request, "reset_password.html")

        if password != confirm:
            messages.error(request, "Passwords do not match.")
            return render(request, "reset_password.html")

        user.password = make_password(password)
        user.save()

        return render(request, "reset_result.html", {
            "status": "success",
            "message": "Your password has been reset successfully."
        })

    return render(request, "reset_password.html")        




User = get_user_model()

@login_required(login_url='login')
def onboarding(request):
    if not request.user.is_authenticated:
        return redirect('login')

    user = User.objects.get(id=request.user.id)

    progress, _ = OnboardingProgress.objects.get_or_create(user=user)

    if progress.status == 'completed':
        return redirect('dashboard')

    return render(request, 'onboarding.html', {
        'current_step': progress.current_step,
        'business_type': progress.business_type,
        'steps': [
            {'label': 'Business Type'},
            {'label': 'Business Profile'},
            {'label': 'Channels'},
            {'label': 'AI Brain'},
            {'label': 'Your Data'},
            {'label': 'Team'},
            {'label': 'Go Live'},
        ]
    })
 
 
# ── Save step dispatcher ──────────────────────────────────────────────────────
 
@login_required(login_url='login')
@require_POST
def save_onboarding_step(request):
    step = request.POST.get('step')
 
    if not step:
        return JsonResponse({'success': False, 'message': 'Step is required'}, status=400)
 
    try:
        step = int(step)
    except ValueError:
        return JsonResponse({'success': False, 'message': 'Invalid step'}, status=400)
 
    try:
        save_fn = {
            0: _save_step0,
            1: _save_step1,
            3: _save_step3,
            4: _save_step4,
            5: _save_step5,
        }.get(step)
 
        if save_fn:
            save_fn(request)
 
        progress, _ = OnboardingProgress.objects.get_or_create(user=request.user)
        if step >= progress.current_step:
            progress.current_step = step + 1
            progress.save()
 
        # Return business_type so JS can stay in sync after step 0
        return JsonResponse({
            'success': True,
            'step': step,
            'business_type': progress.business_type,
        })
 
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=500)
 
 
@login_required(login_url='login')
@require_POST
def complete_onboarding(request):
    progress, _ = OnboardingProgress.objects.get_or_create(user=request.user)
    progress.status = 'completed'
    progress.save()
    return JsonResponse({'success': True})
 
 
# ── Private step savers ───────────────────────────────────────────────────────
 
def _save_step0(request):
    """Save business type selection."""
    business_type = request.POST.get('business_type', '')
    progress, _ = OnboardingProgress.objects.get_or_create(user=request.user)
    progress.business_type = business_type
    progress.save()
 
 
def _save_step1(request):
    """Save business profile."""
    logo = request.FILES.get('logo')
    business_type = request.POST.get('business_type', '')
 
    # Sync business_type onto progress as well
    progress, _ = OnboardingProgress.objects.get_or_create(user=request.user)
    if business_type:
        progress.business_type = business_type
        progress.save()
 
    BusinessProfile.objects.update_or_create(
        user=request.user,
        defaults={
            'business_type':  business_type or progress.business_type,
            'business_name':  request.POST.get('business_name', ''),
            'industry':       request.POST.get('industry', ''),
            'business_email': request.POST.get('business_email', ''),
            'phone':          request.POST.get('phone', ''),
            'website':        request.POST.get('website', ''),
            'description':    request.POST.get('description', ''),
            **({'logo': logo} if logo else {}),
        }
    )
 
 
def _save_step3(request):
    """Save AI brain configuration."""
    faq_file = request.FILES.get('faq_document')
    doc_1    = request.FILES.get('doc_1')
    doc_2    = request.FILES.get('doc_2')
    doc_3    = request.FILES.get('doc_3')
 
    defaults = {
        'agent_name':    request.POST.get('agent_name', ''),
        'tone':          request.POST.get('tone', 'friendly'),
        'greeting':      request.POST.get('greeting', ''),
        'always_know':   request.POST.get('always_know', ''),
        'policies':      request.POST.get('policies', ''),
        'pricing_rules': request.POST.get('pricing_rules', ''),
    }
    if faq_file: defaults['faq_document'] = faq_file
    if doc_1:    defaults['doc_1'] = doc_1
    if doc_2:    defaults['doc_2'] = doc_2
    if doc_3:    defaults['doc_3'] = doc_3
 
    ai_config, _ = AIConfig.objects.update_or_create(user=request.user, defaults=defaults)
 
    # Replace FAQ entries
    questions = request.POST.getlist('faq_q[]')
    answers   = request.POST.getlist('faq_a[]')
    ai_config.faqs.all().delete()
    for q, a in zip(questions, answers):
        if (q or '').strip() and (a or '').strip():
            FAQEntry.objects.create(ai_config=ai_config, question=q.strip(), answer=a.strip())
 
 
def _save_step4(request):
    """Save dynamic step 4 data based on business type."""
    progress, _ = OnboardingProgress.objects.get_or_create(user=request.user)
    btype = progress.business_type
 
    if btype == 'ecommerce':
        _save_step4_ecommerce(request)
    elif btype == 'school':
        _save_step4_school(request)
    elif btype == 'clinic':
        _save_step4_clinic(request)
    elif btype == 'service':
        _save_step4_service(request)
    elif btype == 'restaurant':
        _save_step4_restaurant(request)
    elif btype == 'hotel':
        _save_step4_hotel(request)
    else:
        # finance, corporate, coaching, other
        _save_step4_generic(request)
 
 
def _save_step4_ecommerce(request):
    catalog_method = request.POST.get('catalog_method', 'manual')
    names    = request.POST.getlist('product_name[]')
    prices   = request.POST.getlist('product_price[]')
    stocks   = request.POST.getlist('product_stock[]')
    descs    = request.POST.getlist('product_desc[]')
    variants = request.POST.getlist('product_variants[]')
 
    request.user.products.filter(catalog_method='manual').delete()
    for name, price, stock, desc, variant in zip(names, prices, stocks, descs, variants or ['']*len(names)):
        if (name or '').strip():
            try:
                price_val = Decimal(price) if price else None
            except (InvalidOperation, TypeError):
                price_val = None
            Product.objects.create(
                user=request.user,
                catalog_method=catalog_method,
                name=name.strip(),
                description=desc.strip(),
                price=price_val,
                stock_status=stock or 'in_stock',
                variants=variant.strip() if variant else '',
            )
 
 
def _save_step4_school(request):
    def _dec(val):
        try: return Decimal(val) if val else None
        except: return None
 
    def _date(val):
        from datetime import datetime
        try: return datetime.strptime(val, '%Y-%m-%d').date() if val else None
        except: return None
 
    SchoolInfo.objects.update_or_create(
        user=request.user,
        defaults={
            'classes_offered':  request.POST.get('classes_offered', ''),
            'resumption_date':  _date(request.POST.get('resumption_date')),
            'term_structure':   request.POST.get('term_structure', ''),
            'tuition_fee':      _dec(request.POST.get('tuition_fee')),
            'hostel_fee':       _dec(request.POST.get('hostel_fee')),
            'admission_fee':    _dec(request.POST.get('admission_fee')),
            'other_fees':       request.POST.get('other_fees', ''),
            'term_1_start':     _date(request.POST.get('term_1_start')),
            'term_1_end':       _date(request.POST.get('term_1_end')),
            'term_2_start':     _date(request.POST.get('term_2_start')),
            'term_2_end':       _date(request.POST.get('term_2_end')),
            'term_3_start':     _date(request.POST.get('term_3_start')),
            'term_3_end':       _date(request.POST.get('term_3_end')),
            'exam_period':      request.POST.get('exam_period', ''),
            'address':          request.POST.get('address', ''),
            'directions':       request.POST.get('directions', ''),
        }
    )
 
 
def _save_step4_clinic(request):
    def _dec(val):
        try: return Decimal(val) if val else None
        except: return None
 
    clinic, _ = ClinicInfo.objects.update_or_create(
        user=request.user,
        defaults={
            'consultation_fee':    _dec(request.POST.get('consultation_fee')),
            'opening_hours':       request.POST.get('opening_hours', ''),
            'emergency_available': request.POST.get('emergency_available') == 'on',
            'emergency_number':    request.POST.get('emergency_number', ''),
            'address':             request.POST.get('address', ''),
        }
    )
 
    # Services
    svc_names  = request.POST.getlist('svc_name[]')
    svc_descs  = request.POST.getlist('svc_desc[]')
    svc_prices = request.POST.getlist('svc_price[]')
    clinic.services.all().delete()
    for name, desc, price in zip(svc_names, svc_descs, svc_prices):
        if (name or '').strip():
            try: p = Decimal(price) if price else None
            except: p = None
            ClinicService.objects.create(clinic=clinic, name=name.strip(), description=desc.strip(), price=p)
 
    # Doctors
    doc_names        = request.POST.getlist('doc_name[]')
    doc_specialties  = request.POST.getlist('doc_specialty[]')
    doc_availability = request.POST.getlist('doc_availability[]')
    clinic.doctors.all().delete()
    for name, spec, avail in zip(doc_names, doc_specialties, doc_availability):
        if (name or '').strip():
            ClinicDoctor.objects.create(clinic=clinic, name=name.strip(), specialty=spec.strip(), availability=avail.strip())
 
 
def _save_step4_service(request):
    biz, _ = ServiceBusiness.objects.update_or_create(
        user=request.user,
        defaults={
            'booking_required': request.POST.get('booking_required') == 'on',
            'booking_url':      request.POST.get('booking_url', ''),
        }
    )
    svc_names      = request.POST.getlist('svc_name[]')
    svc_descs      = request.POST.getlist('svc_desc[]')
    svc_ptypes     = request.POST.getlist('svc_pricing_type[]')
    svc_prices     = request.POST.getlist('svc_price[]')
    svc_turnarounds = request.POST.getlist('svc_turnaround[]')
    biz.services.all().delete()
    for name, desc, ptype, price, turn in zip(svc_names, svc_descs, svc_ptypes, svc_prices, svc_turnarounds):
        if (name or '').strip():
            try: p = Decimal(price) if price else None
            except: p = None
            ServiceItem.objects.create(
                business=biz, name=name.strip(), description=desc.strip(),
                pricing_type=ptype or 'fixed', price=p, turnaround_time=turn.strip()
            )
 
 
def _save_step4_restaurant(request):
    def _dec(val):
        try: return Decimal(val) if val else None
        except: return None
 
    rest, _ = RestaurantInfo.objects.update_or_create(
        user=request.user,
        defaults={
            'opening_hours':   request.POST.get('opening_hours', ''),
            'delivery_option': request.POST.get('delivery_option', 'both'),
            'delivery_fee':    _dec(request.POST.get('delivery_fee')),
            'min_order':       _dec(request.POST.get('min_order')),
            'address':         request.POST.get('address', ''),
        }
    )
    item_cats   = request.POST.getlist('item_category[]')
    item_names  = request.POST.getlist('item_name[]')
    item_descs  = request.POST.getlist('item_desc[]')
    item_prices = request.POST.getlist('item_price[]')
    rest.menu_items.all().delete()
    for cat, name, desc, price in zip(item_cats, item_names, item_descs, item_prices):
        if (name or '').strip():
            try: p = Decimal(price) if price else None
            except: p = None
            MenuItem.objects.create(restaurant=rest, category=cat.strip(), name=name.strip(), description=desc.strip(), price=p)
 
 
def _save_step4_hotel(request):
    hotel, _ = HotelInfo.objects.update_or_create(
        user=request.user,
        defaults={
            'check_in_time':  request.POST.get('check_in_time', ''),
            'check_out_time': request.POST.get('check_out_time', ''),
            'amenities':      request.POST.get('amenities', ''),
            'address':        request.POST.get('address', ''),
        }
    )
    room_types   = request.POST.getlist('room_type[]')
    room_descs   = request.POST.getlist('room_desc[]')
    room_prices  = request.POST.getlist('room_price[]')
    room_caps    = request.POST.getlist('room_capacity[]')
    hotel.rooms.all().delete()
    for rtype, desc, price, cap in zip(room_types, room_descs, room_prices, room_caps):
        if (rtype or '').strip():
            try: p = Decimal(price) if price else None
            except: p = None
            try: c = int(cap) if cap else 2
            except: c = 2
            HotelRoom.objects.create(hotel=hotel, room_type=rtype.strip(), description=desc.strip(), price_night=p, capacity=c)
 
 
def _save_step4_generic(request):
    GenericServiceInfo.objects.update_or_create(
        user=request.user,
        defaults={
            'offerings':        request.POST.get('offerings', ''),
            'pricing_summary':  request.POST.get('pricing_summary', ''),
            'opening_hours':    request.POST.get('opening_hours', ''),
            'address':          request.POST.get('address', ''),
            'extra_notes':      request.POST.get('extra_notes', ''),
        }
    )
 
 
def _save_step5(request):
    NotificationSettings.objects.update_or_create(
        user=request.user,
        defaults={
            'notif_email':       request.POST.get('notif_email', ''),
            'notif_slack':       request.POST.get('notif_slack', ''),
            'notify_new_conv':   request.POST.get('notif_new_conv')   == 'on',
            'notify_sale':       request.POST.get('notif_sale')       == 'on',
            'notify_escalation': request.POST.get('notif_escalation') == 'on',
            'notify_weekly':     request.POST.get('notif_weekly')     == 'on',
        }
    )
    emails = request.POST.getlist('team_email[]')
    roles  = request.POST.getlist('team_role[]')
    for email, role in zip(emails, roles):
        if email.strip():
            TeamMember.objects.update_or_create(
                owner=request.user, email=email.strip(),
                defaults={'role': role}
            )
 
 
# ── Channel views ─────────────────────────────────────────────────────────────
 
@login_required
def channel_status(request):
    channels = MessagingChannel.objects.filter(user=request.user)
    data = []
    for ch in channels:
        data.append({
            'channel': ch.channel,
            'status':  'connected' if ch.is_active else 'disconnected',
            'handle':  ch.handle,
        })
    return JsonResponse({'channels': data})
 
 
@login_required
def connect_channel(request, channel):
    if channel == 'whatsapp':
        return connect_whatsapp(request)
    elif channel == 'instagram':
        return connect_instagram(request)
    elif channel == 'telegram':
        return _connect_telegram_info(request)
    elif channel == 'intercom':
        return connect_intercom(request)
    return JsonResponse({'error': 'Invalid channel'}, status=400)
 
 
@login_required
def whatsapp_callback(request):
    code = request.GET.get('code')
    if not code:
        return redirect('/onboarding?error=access_denied&step=2')
    try:
        token_url = 'https://graph.facebook.com/v18.0/oauth/access_token'
        params = {
            'client_id':     'YOUR_META_APP_ID',
            'client_secret': 'YOUR_META_APP_SECRET',
            'redirect_uri':  request.build_absolute_uri('/channels/callback/whatsapp'),
            'code':          code,
        }
        token_res    = requests.get(token_url, params=params).json()
        access_token = token_res.get('access_token')
        MessagingChannel.objects.update_or_create(
            user=request.user, channel='whatsapp',
            defaults={'is_active': True, 'access_token': access_token, 'handle': 'WhatsApp Business'}
        )
        return redirect('/onboarding?connected=whatsapp&step=2')
    except Exception:
        return redirect('/onboarding?error=token_exchange_failed&step=2')
 
 
def _connect_telegram_info(request):
    return JsonResponse({
        'method':       'telegram_widget',
        'bot_username': 'YOUR_TELEGRAM_BOT',
        'callback_url': request.build_absolute_uri('/channels/callback/telegram'),
    })
 
 
@login_required
def telegram_callback(request):
    username = request.GET.get('username')
    MessagingChannel.objects.update_or_create(
        user=request.user, channel='telegram',
        defaults={'is_active': True, 'handle': username, 'access_token': 'telegram_user_auth'}
    )
    return redirect('/onboarding?connected=telegram&step=2')
 
 
@login_required
@require_POST
def disconnect_channel(request, channel):
    MessagingChannel.objects.filter(user=request.user, channel=channel).update(is_active=False)
    return JsonResponse({'success': True})
 