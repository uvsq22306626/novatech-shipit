#!/bin/sh
set -e
sed "s|\${SLACK_WEBHOOK_URL}|$SLACK_WEBHOOK_URL|g" /etc/alertmanager/alertmanager.yml.template > /etc/alertmanager/alertmanager.yml
exec /bin/alertmanager --config.file=/etc/alertmanager/alertmanager.yml --storage.path=/alertmanager
