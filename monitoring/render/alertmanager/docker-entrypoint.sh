#!/bin/sh
set -e

if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "FATAL: SLACK_WEBHOOK_URL is not set — configure it in the service's Environment settings." >&2
  exit 1
fi

sed "s|\${SLACK_WEBHOOK_URL}|$SLACK_WEBHOOK_URL|g" /etc/alertmanager/alertmanager.yml.template > /etc/alertmanager/alertmanager.yml
exec /bin/alertmanager --config.file=/etc/alertmanager/alertmanager.yml --storage.path=/alertmanager
