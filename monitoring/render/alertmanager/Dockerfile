FROM prom/alertmanager:v0.27.0
COPY alertmanager.yml /etc/alertmanager/alertmanager.yml.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
USER root
RUN chmod +x /docker-entrypoint.sh
EXPOSE 9093
ENTRYPOINT ["/docker-entrypoint.sh"]
