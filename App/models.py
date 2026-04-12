from django.db import models
from django.conf import settings

class OnboardingProgress(models.Model):
    """Tracks which step the user is on so they can resume."""
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]
    user            = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='onboarding')
    current_step    = models.PositiveSmallIntegerField(default=1)
    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_progress')
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email} — Step {self.current_step} ({self.status})"


class BusinessProfile(models.Model):
    """Step 1 data."""
    user            = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='business_profile')
    business_name   = models.CharField(max_length=255)
    industry        = models.CharField(max_length=100)
    business_email  = models.EmailField()
    phone           = models.CharField(max_length=30)
    website         = models.URLField(blank=True)
    description     = models.TextField()
    logo            = models.ImageField(upload_to='logos/', blank=True, null=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

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
    user         = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='channels')
    channel      = models.CharField(max_length=30, choices=CHANNEL_CHOICES)
    is_active    = models.BooleanField(default=True)
    handle       = models.CharField(max_length=255, blank=True)   # username / number
    access_token = models.TextField(blank=True)                   # encrypted in production
    extra_data   = models.JSONField(default=dict, blank=True)     # flexible extra fields
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'channel')

    def __str__(self):
        return f"{self.user.email} — {self.channel}"


class AIConfig(models.Model):
    """Step 3 — AI agent configuration."""
    TONE_CHOICES = [
        ('professional', 'Professional'),
        ('friendly',     'Friendly'),
        ('casual',       'Casual'),
        ('luxury',       'Luxury'),
    ]
    user         = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='ai_config')
    agent_name   = models.CharField(max_length=100)
    tone         = models.CharField(max_length=20, choices=TONE_CHOICES)
    greeting     = models.TextField()
    faq_document = models.FileField(upload_to='faqs/', blank=True, null=True)
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


class Product(models.Model):
    """Step 4 — product/service catalogue."""
    STOCK_CHOICES = [
        ('in_stock',    'In Stock'),
        ('limited',     'Limited Stock'),
        ('pre_order',   'Pre-order'),
        ('out_of_stock','Out of Stock'),
    ]
    CATALOG_METHOD_CHOICES = [
        ('manual',  'Manual'),
        ('csv',     'CSV Import'),
        ('shopify', 'Shopify'),
        ('woo',     'WooCommerce'),
    ]
    user           = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='products')
    catalog_method = models.CharField(max_length=20, choices=CATALOG_METHOD_CHOICES, default='manual')
    name           = models.CharField(max_length=255)
    description    = models.TextField(blank=True)
    price          = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    stock_status   = models.CharField(max_length=20, choices=STOCK_CHOICES, default='in_stock')
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


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
    owner      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='team_members')
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
    user               = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notification_settings')
    notif_email        = models.EmailField()
    notif_slack        = models.URLField(blank=True)
    notify_new_conv    = models.BooleanField(default=True)
    notify_sale        = models.BooleanField(default=True)
    notify_escalation  = models.BooleanField(default=True)
    notify_weekly      = models.BooleanField(default=False)
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Notifications for {self.user.email}"