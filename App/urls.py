from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name = 'index'),
    path('login', views.login, name='login'),
    path('register', views.register, name='register'),
    path('logout', views.logout, name='logout'),
    path('verify-email/<uidb64>/<token>/',views.verify_email,name='verify_email'),
    path('resend-verification/',views.resend_verification,name='resend_verification'),
    path("forgot-password/", views.forgot_password, name="forgot_password"),
    path("reset-password/<uidb64>/<token>/", views.reset_password, name="reset_password"),
    path('onboarding', views.onboarding, name='onboarding'),
    path('onboarding/save-step', views.save_onboarding_step, name='onboarding_save_step'),
    path('onboarding/complete', views.complete_onboarding, name='onboarding_complete'),
    
    path("channels/status", views.channel_status),
    path("channels/connect/<str:channel>", views.connect_channel),
    path("channels/disconnect/<str:channel>", views.disconnect_channel),

    # Callbacks
    path("channels/callback/whatsapp", views.whatsapp_callback),
    path("channels/callback/telegram", views.telegram_callback),
]
