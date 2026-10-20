FROM php:8.5-apache
RUN apt-get update && apt-get install -y --no-install-recommends libicu-dev libonig-dev mariadb-client ca-certificates \
    && docker-php-ext-install pdo_mysql intl mbstring \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /var/www/html
COPY application application
COPY assets assets
COPY database database
COPY index.php .htaccess favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png android-chrome-192x192.png android-chrome-512x512.png site.webmanifest ./
RUN mkdir -p writable/media writable/sessions writable/cache writable/backups \
    && chown -R www-data:www-data writable
COPY config-example/php-production.ini /usr/local/etc/php/conf.d/mce.ini
ENV APP_ENV=production SESSION_SECURE=1 MEDIA_DRIVER=local
