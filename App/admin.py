from django.contrib import admin
from .models import (
    OnboardingProgress, BusinessProfile, MessagingChannel,
    AIConfig, FAQEntry, Product, TeamMember, NotificationSettings
)
# Register your models here.
admin.site.register(OnboardingProgress)
admin.site.register(BusinessProfile)
admin.site.register(MessagingChannel)
admin.site.register(AIConfig)
admin.site.register(FAQEntry)
admin.site.register(Product)
admin.site.register(TeamMember)
admin.site.register(NotificationSettings)
