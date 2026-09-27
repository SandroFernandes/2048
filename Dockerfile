# Production image: the whole app is static files served by nginx.
#   docker build -t tessera . && docker run --rm -p 8080:80 tessera
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/
EXPOSE 80
