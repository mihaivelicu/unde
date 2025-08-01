# Manual run
gunicorn -k gevent -w 1 -b 127.0.0.1:5000 app:app

# Auto-reload on code changes (dev)
gunicorn -k gevent -w 1 -b 127.0.0.1:5000 --reload app:app

# Scale up a bit (example: 2 workers, 2000 conns per worker)
gunicorn -k gevent -w 2 --worker-connections 2000 -b 127.0.0.1:5000 app:app

# Graceful stop from another shell
pkill -TERM -f "gunicorn.*app:app"

# If running under systemd, after editing code
unde start
unde stop
unde restart
unde status
unde logs
unde follow
