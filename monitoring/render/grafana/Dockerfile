FROM grafana/grafana:10.4.0
COPY provisioning /etc/grafana/provisioning
COPY dashboards /var/lib/grafana/dashboards
ENV GF_USERS_ALLOW_SIGN_UP=false
ENV GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/var/lib/grafana/dashboards/novatech.json
EXPOSE 3000
