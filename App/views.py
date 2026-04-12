from django.shortcuts import render, redirect
from django.contrib.auth import get_user_model, login as auth_login 
from django.contrib.auth.models import auth
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




@login_required(login_url='login')
def onboarding(request):
    # Get or create a progress tracker for this user
    progress, _ = OnboardingProgress.objects.get_or_create(user=request.user)

    # If already completed, send them to dashboard
    if progress.status == 'completed':
        return redirect('dashboard')

    return render(request, 'onboarding.html', {
        'current_step': progress.current_step,
        'steps': [
            {'label': 'Business Profile'},
            {'label': 'Channels'},
            {'label': 'AI Setup'},
            {'label': 'Products'},
            {'label': 'Team'},
            {'label': 'Go Live'},
        ]
    })


@login_required(login_url='login')
@require_POST
def save_onboarding_step(request):
    step = request.POST.get('step')

    if not step:
        return JsonResponse({
            'success': False,
            'message': 'Step is required'
        }, status=400)

    try:
        step = int(step)
    except ValueError:
        return JsonResponse({
            'success': False,
            'message': 'Invalid step'
        }, status=400)

    save_fn = {
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

    return JsonResponse({'success': True, 'step': step})

@login_required(login_url='login')
@require_POST
def complete_onboarding(request):
    progress, _ = OnboardingProgress.objects.get_or_create(user=request.user)
    progress.status = 'completed'
    progress.save()
    return JsonResponse({'success': True})


# ── Private step savers ──────────────────────────────────

def _save_step1(request):
    logo = request.FILES.get('logo')
    BusinessProfile.objects.update_or_create(
        user=request.user,
        defaults={
            'business_name':  request.POST.get('business_name', ''),
            'industry':       request.POST.get('industry', ''),
            'business_email': request.POST.get('business_email', ''),
            'phone':          request.POST.get('phone', ''),
            'website':        request.POST.get('website', ''),
            'description':    request.POST.get('description', ''),
            **({'logo': logo} if logo else {}),
        }
    )


@login_required
def channel_status(request):
    channels = MessagingChannel.objects.filter(user=request.user)

    data = []
    for ch in channels:
        data.append({
            "channel": ch.channel,
            "status": "connected" if ch.is_active else "disconnected",
            "handle": ch.handle,
        })

    return JsonResponse({"channels": data})

@login_required
def connect_channel(request, channel):
    if channel == "whatsapp":
        return connect_whatsapp(request)

    elif channel == "instagram":
        return connect_instagram(request)

    elif channel == "telegram":
        return connect_telegram(request)

    elif channel == "intercom":
        return connect_intercom(request)

    return JsonResponse({"error": "Invalid channel"}, status=400)


@login_required
def whatsapp_callback(request):
    code = request.GET.get("code")

    if not code:
        return redirect("/onboarding?error=access_denied&step=2")

    try:
        # Exchange code for access token
        token_url = "https://graph.facebook.com/v18.0/oauth/access_token"

        params = {
            "client_id": "YOUR_META_APP_ID",
            "client_secret": "YOUR_META_APP_SECRET",
            "redirect_uri": request.build_absolute_uri("/channels/callback/whatsapp"),
            "code": code,
        }

        token_res = requests.get(token_url, params=params).json()
        access_token = token_res.get("access_token")

        # 🔥 Save immediately (THIS replaces _save_step2)
        MessagingChannel.objects.update_or_create(
            user=request.user,
            channel="whatsapp",
            defaults={
                "is_active": True,
                "access_token": access_token,
                "handle": "WhatsApp Business",
            }
        )

        return redirect("/onboarding?connected=whatsapp&step=2")

    except Exception as e:
        return redirect(f"/onboarding?error=token_exchange_failed&step=2")
    

@login_required
def connect_telegram(request):
    return JsonResponse({
        "method": "telegram_widget",
        "bot_username": "YOUR_TELEGRAM_BOT",
        "callback_url": request.build_absolute_uri("/channels/callback/telegram")
    })
    

@login_required
def telegram_callback(request):
    username = request.GET.get("username")

    MessagingChannel.objects.update_or_create(
        user=request.user,
        channel="telegram",
        defaults={
            "is_active": True,
            "handle": username,
            "access_token": "telegram_user_auth",
        }
    )

    return redirect("/onboarding?connected=telegram&step=2")



@login_required
@require_POST
def disconnect_channel(request, channel):
    MessagingChannel.objects.filter(
        user=request.user,
        channel=channel
    ).update(is_active=False)

    return JsonResponse({"success": True})

def _save_step3(request):
    
    try:
        faq_file = request.FILES.get('faq_document')
        ai_config, _ = AIConfig.objects.update_or_create(
            user=request.user,
            defaults={
                'agent_name':   request.POST.get('agent_name', ''),
                'tone':         request.POST.get('tone', 'friendly'),
                'greeting':     request.POST.get('greeting', ''),
                **({'faq_document': faq_file} if faq_file else {}),
            }
        )
        # Save manual FAQ entries — replace existing ones
        questions = request.POST.getlist('faq_q[]')
        answers   = request.POST.getlist('faq_a[]')
        ai_config.faqs.all().delete()
        for q, a in zip(questions, answers):
            if (q or "").strip() and (a or "").strip():
                FAQEntry.objects.create(ai_config=ai_config, question=q.strip(), answer=a.strip())
    
    except Exception as e:
        print("STEP 3 ERROR:", e)
        raise


def _save_step4(request):
    try:
        catalog_method = request.POST.get('catalog_method', 'manual')
        names   = request.POST.getlist('product_name[]')
        prices  = request.POST.getlist('product_price[]')
        stocks  = request.POST.getlist('product_stock[]')
        descs   = request.POST.getlist('product_desc[]')

        # Replace existing manual products
        request.user.products.filter(catalog_method='manual').delete()
        for name, price, stock, desc in zip(names, prices, stocks, descs):
            if (name or "").strip():
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
                )
    except Exception as e:
        print("STEP 3 ERROR:", e)
        raise


def _save_step5(request):
    try:
        # Save notification settings
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
        # Save team invitations
        emails = request.POST.getlist('team_email[]')
        roles  = request.POST.getlist('team_role[]')
        for email, role in zip(emails, roles):
            if email.strip():
                TeamMember.objects.update_or_create(
                    owner=request.user,
                    email=email.strip(),
                    defaults={'role': role}
                )
    except Exception as e:
        print("STEP 3 ERROR:", e)
        raise