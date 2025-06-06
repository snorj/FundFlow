# Generated by Django 5.1.7 on 2025-05-20 09:29

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0003_remove_transaction_amount_transaction_aud_amount_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='transaction',
            name='original_amount',
            field=models.DecimalField(decimal_places=2, help_text='The amount of the transaction in the original currency.', max_digits=12),
        ),
        migrations.CreateModel(
            name='HistoricalExchangeRate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(db_index=True, help_text='The date for which this exchange rate is valid.')),
                ('source_currency', models.CharField(db_index=True, help_text='The source currency code (e.g., AUD).', max_length=3)),
                ('target_currency', models.CharField(db_index=True, help_text='The target currency code (e.g., USD, EUR).', max_length=3)),
                ('rate', models.DecimalField(decimal_places=9, help_text='The exchange rate: 1 unit of source_currency equals this many units of target_currency.', max_digits=18)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Historical Exchange Rate',
                'verbose_name_plural': 'Historical Exchange Rates',
                'ordering': ['-date', 'source_currency', 'target_currency'],
                'unique_together': {('date', 'source_currency', 'target_currency')},
            },
        ),
    ]
