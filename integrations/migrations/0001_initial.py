# Generated by Django 5.1.7 on 2025-05-02 11:36

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='UpIntegration',
            fields=[
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name='up_integration', serialize=False, to=settings.AUTH_USER_MODEL)),
                ('personal_access_token_encrypted', models.TextField(help_text='Stores the encrypted Up Bank Personal Access Token.')),
                ('last_synced_at', models.DateTimeField(blank=True, help_text='Timestamp of the last successful transaction sync completion.', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Up Bank Integration',
                'verbose_name_plural': 'Up Bank Integrations',
            },
        ),
    ]
