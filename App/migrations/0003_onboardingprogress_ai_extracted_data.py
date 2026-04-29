from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('App', '0002_aiconfig_always_know_aiconfig_doc_1_aiconfig_doc_2_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='onboardingprogress',
            name='ai_extracted_data',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
