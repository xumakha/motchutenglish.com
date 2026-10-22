FROM php:8.5-apache-trixie
RUN apt-get update && apt-get install -y --no-install-recommends libicu-dev libonig-dev mariadb-client ca-certificates python3 \
    && docker-php-ext-install pdo_mysql intl mbstring \
    && a2enmod rewrite headers \
    && python3 -c "import sys; assert sys.version_info >= (3, 12), 'media backup requires Python >= 3.12'" \
    && php -r 'foreach (["pdo_mysql","intl","mbstring","fileinfo","openssl"] as $extension) { if (!extension_loaded($extension)) { fwrite(STDERR, "Missing extension: ".$extension); exit(1); } }' \
    && mariadb-dump --version && mariadb --version \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /var/www/html
COPY application application
COPY assets assets
COPY database database
COPY index.php .htaccess favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png android-chrome-192x192.png android-chrome-512x512.png site.webmanifest ./
RUN mkdir -p writable/media writable/sessions writable/cache writable/backups \
    && chown -R www-data:www-data writable
COPY config-example/php-production.ini /usr/local/etc/php/conf.d/mce.ini
ENV APP_ENV=production SESSION_SECURE=1 MEDIA_DRIVER=local MYSQLDUMP_BIN=/usr/bin/mariadb-dump MYSQL_BIN=/usr/bin/mariadb
