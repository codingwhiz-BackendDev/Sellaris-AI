from django.db import models
from django.conf import settings


# ── Business Type Choices (used across multiple models) ──────────────────────
BUSINESS_TYPE_CHOICES = [
    ('ecommerce',    'E-commerce / Online Store'),
    ('school',       'School / Educational Institution'),
    ('clinic',       'Clinic / Hospital'),
    ('service',      'Service Business'),
    ('hotel',        'Hotel / Hospitality'),
    ('restaurant',   'Restaurant / Food Business'),
    ('finance',      'Finance / Fintech'),
    ('corporate',    'Corporate / Company'),
    ('coaching',     'Coaching / Course Creator'),
    ('other',        'Other'),
]


class OnboardingProgress(models.Model):
    """Tracks which step the user is on so they can resume."""
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('completed',   'Completed'),
    ]
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='onboarding'
    )
    business_type = models.CharField(
        max_length=30, choices=BUSINESS_TYPE_CHOICES, blank=True, default=''
    )
    current_step  = models.PositiveSmallIntegerField(default=0)   # 0 = type selection
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_progress')
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email} — Step {self.current_step} ({self.status})"


class BusinessProfile(models.Model):
    """Step 1 data."""
    user           = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='business_profile'
    )
    business_type  = models.CharField(max_length=30, choices=BUSINESS_TYPE_CHOICES, blank=True)
    business_name  = models.CharField(max_length=255)
    industry       = models.CharField(max_length=100)
    business_email = models.EmailField()
    phone          = models.CharField(max_length=30)
    website        = models.URLField(blank=True)
    description    = models.TextField()
    logo           = models.ImageField(upload_to='logos/', blank=True, null=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.business_name


class MessagingChannel(models.Model):
    """Step 2 — one row per connected channel."""
    CHANNEL_CHOICES = [
        ('whatsapp',  'WhatsApp'),
        ('instagram', 'Instagram'),
        ('telegram',  'Telegram'),
        ('intercom',  'Intercom'),
    ]
    user         = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='channels'
    )
    channel      = models.CharField(max_length=30, choices=CHANNEL_CHOICES)
    is_active    = models.BooleanField(default=True)
    handle       = models.CharField(max_length=255, blank=True)
    access_token = models.TextField(blank=True)
    extra_data   = models.JSONField(default=dict, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'channel')

    def __str__(self):
        return f"{self.user.email} — {self.channel}"


class AIConfig(models.Model):
    """Step 3 — AI agent configuration and knowledge base."""
    TONE_CHOICES = [
        ('professional', 'Professional'),
        ('friendly',     'Friendly'),
        ('casual',       'Casual'),
        ('luxury',       'Luxury'),
    ]
    user         = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='ai_config'
    )
    agent_name   = models.CharField(max_length=100)
    tone         = models.CharField(max_length=20, choices=TONE_CHOICES)
    greeting     = models.TextField()
    # Document uploads the AI should learn from
    faq_document = models.FileField(upload_to='faqs/', blank=True, null=True)
    doc_1        = models.FileField(upload_to='ai_docs/', blank=True, null=True)
    doc_2        = models.FileField(upload_to='ai_docs/', blank=True, null=True)
    doc_3        = models.FileField(upload_to='ai_docs/', blank=True, null=True)
    # Structured knowledge
    always_know  = models.TextField(blank=True, help_text="What the AI should ALWAYS know")
    policies     = models.TextField(blank=True, help_text="Important policies")
    pricing_rules = models.TextField(blank=True, help_text="Pricing rules")
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.agent_name} ({self.user.email})"


class FAQEntry(models.Model):
    """Step 3 — manual FAQ entries linked to an AI config."""
    ai_config  = models.ForeignKey(AIConfig, on_delete=models.CASCADE, related_name='faqs')
    question   = models.TextField()
    answer     = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.question[:60]


# ── Step 4: Dynamic data models per business type ────────────────────────────

class Product(models.Model):
    """Step 4 — E-commerce product/service catalogue."""
    STOCK_CHOICES = [
        ('in_stock',     'In Stock'),
        ('limited',      'Limited Stock'),
        ('pre_order',    'Pre-order'),
        ('out_of_stock', 'Out of Stock'),
    ]
    CATALOG_METHOD_CHOICES = [
        ('manual',  'Manual'),
        ('csv',     'CSV Import'),
        ('shopify', 'Shopify'),
        ('woo',     'WooCommerce'),
    ]
    user           = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='products'
    )
    catalog_method = models.CharField(max_length=20, choices=CATALOG_METHOD_CHOICES, default='manual')
    name           = models.CharField(max_length=255)
    description    = models.TextField(blank=True)
    price          = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    stock_status   = models.CharField(max_length=20, choices=STOCK_CHOICES, default='in_stock')
    variants       = models.TextField(blank=True, help_text="Comma-separated variants e.g. Red, Blue, Size M")
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class SchoolInfo(models.Model):
    """Step 4 — School/Educational Institution data."""
    user             = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='school_info'
    )
    # Academic
    classes_offered  = models.TextField(blank=True, help_text="e.g. JSS1, JSS2, SS1, SS2, SS3")
    resumption_date  = models.DateField(null=True, blank=True)
    term_structure   = models.CharField(max_length=50, blank=True, help_text="e.g. 3 terms per year")
    # Fees
    tuition_fee      = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    hostel_fee       = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    admission_fee    = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    other_fees       = models.TextField(blank=True)
    # Calendar
    term_1_start     = models.DateField(null=True, blank=True)
    term_1_end       = models.DateField(null=True, blank=True)
    term_2_start     = models.DateField(null=True, blank=True)
    term_2_end       = models.DateField(null=True, blank=True)
    term_3_start     = models.DateField(null=True, blank=True)
    term_3_end       = models.DateField(null=True, blank=True)
    exam_period      = models.TextField(blank=True)
    # Location
    address          = models.TextField(blank=True)
    directions       = models.TextField(blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"School info for {self.user.email}"


class ClinicInfo(models.Model):
    """Step 4 — Clinic/Hospital data."""
    user                  = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='clinic_info'
    )
    consultation_fee      = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    opening_hours         = models.TextField(blank=True)
    emergency_available   = models.BooleanField(default=False)
    emergency_number      = models.CharField(max_length=30, blank=True)
    address               = models.TextField(blank=True)
    created_at            = models.DateTimeField(auto_now_add=True)
    updated_at            = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Clinic info for {self.user.email}"


class ClinicService(models.Model):
    """Services offered by a clinic."""
    clinic      = models.ForeignKey(ClinicInfo, on_delete=models.CASCADE, related_name='services')
    name        = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    price       = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return self.name


class ClinicDoctor(models.Model):
    """Doctors at a clinic."""
    clinic       = models.ForeignKey(ClinicInfo, on_delete=models.CASCADE, related_name='doctors')
    name         = models.CharField(max_length=255)
    specialty    = models.CharField(max_length=255)
    availability = models.TextField(blank=True)

    def __str__(self):
        return self.name


class ServiceBusiness(models.Model):
    """Step 4 — Service Business data (barber, agency, freelancer, etc.)."""
    user            = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='service_business'
    )
    booking_required = models.BooleanField(default=True)
    booking_url      = models.URLField(blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Service business for {self.user.email}"


class ServiceItem(models.Model):
    """A service offered by a service business."""
    PRICING_TYPE_CHOICES = [
        ('fixed',  'Fixed Price'),
        ('custom', 'Custom Quote'),
        ('hourly', 'Per Hour'),
    ]
    business        = models.ForeignKey(ServiceBusiness, on_delete=models.CASCADE, related_name='services')
    name            = models.CharField(max_length=255)
    description     = models.TextField(blank=True)
    pricing_type    = models.CharField(max_length=10, choices=PRICING_TYPE_CHOICES, default='fixed')
    price           = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    turnaround_time = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return self.name


class RestaurantInfo(models.Model):
    """Step 4 — Restaurant/Food Business data."""
    DELIVERY_CHOICES = [
        ('dine_only',     'Dine-in Only'),
        ('delivery_only', 'Delivery Only'),
        ('both',          'Dine-in & Delivery'),
        ('takeaway',      'Takeaway'),
    ]
    user             = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='restaurant_info'
    )
    opening_hours    = models.TextField(blank=True)
    delivery_option  = models.CharField(max_length=20, choices=DELIVERY_CHOICES, default='both')
    delivery_fee     = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    min_order        = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    address          = models.TextField(blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Restaurant info for {self.user.email}"


class MenuItem(models.Model):
    """Menu item for a restaurant."""
    restaurant  = models.ForeignKey(RestaurantInfo, on_delete=models.CASCADE, related_name='menu_items')
    category    = models.CharField(max_length=100, blank=True, help_text="e.g. Starters, Mains, Drinks")
    name        = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    price       = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    available   = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class HotelInfo(models.Model):
    """Step 4 — Hotel/Hospitality data."""
    user           = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='hotel_info'
    )
    check_in_time  = models.CharField(max_length=20, blank=True)
    check_out_time = models.CharField(max_length=20, blank=True)
    amenities      = models.TextField(blank=True, help_text="Comma-separated: WiFi, Pool, Gym…")
    address        = models.TextField(blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Hotel info for {self.user.email}"


class HotelRoom(models.Model):
    """Room types for a hotel."""
    hotel       = models.ForeignKey(HotelInfo, on_delete=models.CASCADE, related_name='rooms')
    room_type   = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    price_night = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    capacity    = models.PositiveSmallIntegerField(default=2)
    available   = models.BooleanField(default=True)

    def __str__(self):
        return self.room_type


class GenericServiceInfo(models.Model):
    """Step 4 — Generic data for Finance, Corporate, Coaching, and Other business types."""
    user            = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='generic_service_info'
    )
    offerings       = models.TextField(blank=True, help_text="What you offer (free text)")
    pricing_summary = models.TextField(blank=True)
    opening_hours   = models.TextField(blank=True)
    address         = models.TextField(blank=True)
    extra_notes     = models.TextField(blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Generic info for {self.user.email}"


# ── Step 5 ────────────────────────────────────────────────────────────────────

class TeamMember(models.Model):
    """Step 5 — invited team members."""
    ROLE_CHOICES = [
        ('admin',   'Admin'),
        ('manager', 'Manager'),
        ('agent',   'Support Agent'),
        ('viewer',  'Viewer'),
    ]
    STATUS_CHOICES = [
        ('pending',  'Pending'),
        ('accepted', 'Accepted'),
    ]
    owner      = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='team_members'
    )
    email      = models.EmailField()
    role       = models.CharField(max_length=20, choices=ROLE_CHOICES, default='agent')
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    invited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('owner', 'email')

    def __str__(self):
        return f"{self.email} ({self.role})"


class NotificationSettings(models.Model):
    """Step 5 — notification preferences."""
    user              = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notification_settings'
    )
    notif_email       = models.EmailField()
    notif_slack       = models.URLField(blank=True)
    notify_new_conv   = models.BooleanField(default=True)
    notify_sale       = models.BooleanField(default=True)
    notify_escalation = models.BooleanField(default=True)
    notify_weekly     = models.BooleanField(default=False)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Notifications for {self.user.email}"