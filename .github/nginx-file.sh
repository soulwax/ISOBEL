# File: .github/nginx-file.sh

sudo tee /etc/nginx/sites-available/isobel.battlecry.tech.conf > /dev/null << 'EOF'
server {
    server_name isobel.battlecry.tech;
    access_log /var/log/nginx/reverse-access.log;
    error_log /var/log/nginx/reverse-error.log;

    # Proxy API requests to the auth server
    location /api/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Serve frontend from Vite
    location / {
        proxy_pass http://127.0.0.1 :3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    listen [::]:443 ssl; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/isobel.battlecry.tech/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/isobel.battlecry.tech/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

}
server {
    if ($host = isobel.battlecry.tech) {
        return 301 https://$host$request_uri;
    } # managed by Certbot


    server_name isobel.battlecry.tech;
    listen 80;
    listen [::]:80;
    return 404; # managed by Certbot


}
EOF
