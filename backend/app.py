import os, uuid, re, json, threading
from PIL import Image, UnidentifiedImageError
from flask import Flask, jsonify, request, abort, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from flask_sock import Sock

# NOTE: WebSockets (Flask-Sock)
# - Dev: `flask run` works (Werkzeug supports). Good for development.
# - Prod: use an async server, e.g.:
#     gunicorn -k gevent -w 1 -b 127.0.0.1:5000 app:app
#   Single worker because broadcasts are in-process.
#   For multi-worker, add Redis pub/sub and broadcast via Redis.

def slugify(name: str) -> str:
    s = re.sub(r'\s+', '-', name.strip().lower())
    s = re.sub(r'[^a-z0-9\-]', '', s)
    s = re.sub(r'-{2,}', '-', s).strip('-')
    return s or 'group'



load_dotenv()

basedir = os.path.abspath(os.path.dirname(__file__))
MEDIA_DIR          = os.getenv("MEDIA_DIR", os.path.join(basedir, "uploads"))
MEDIA_URL_PREFIX   = os.getenv("MEDIA_URL_PREFIX", "/media")
MAX_UPLOAD_MB      = int(os.getenv("MAX_UPLOAD_MB", "25"))
MAX_DIM_PX         = int(os.getenv("MAX_DIM_PX", "2400"))
JPEG_QUALITY       = int(os.getenv("JPEG_QUALITY", "82"))
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}

os.makedirs(MEDIA_DIR, exist_ok=True)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

db_url = os.getenv("DATABASE_URL") or "sqlite:///" + os.path.join(basedir, "unde_app.db")
app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

sock = Sock(app)

# -------------------------- Helpers -------------------------- #
def to_hex(color: str) -> str:
    """Normalize any color input to a 6-digit hex like #rrggbb."""
    color = (color or "").strip().lower()
    named = {
        "red": "#ef4444",
        "green": "#10b981",
        "blue": "#3b82f6",
        "orange": "#f97316",
        "yellow": "#f59e0b",
        "violet": "#8b5cf6",
        "purple": "#8b5cf6",
        "grey": "#6b7280",
        "gray": "#6b7280",
        "black": "#111827",
    }
    if color in named:
        return named[color]

    if color.startswith("#"):
        s = color[1:]
        if len(s) == 3:
            s = "".join(ch * 2 for ch in s)
        if len(s) == 6 and all(c in "0123456789abcdef" for c in s):
            return f"#{s}"

    # fallback
    return "#ef4444"


# -------------------------- Models -------------------------- #
class Group(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False)
    statuses = db.relationship("Status", backref="group", cascade="all, delete-orphan")
    pins     = db.relationship("Pin", backref="group",  cascade="all, delete-orphan")

class Status(db.Model):
    id       = db.Column(db.Integer, primary_key=True)
    label    = db.Column(db.String(50), nullable=False)
    color    = db.Column(db.String(20), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey("group.id"), nullable=False)

class Pin(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.Text)
    lat         = db.Column(db.Float, nullable=False)
    lng         = db.Column(db.Float, nullable=False)
    upvotes     = db.Column(db.Integer, default=0)
    group_id    = db.Column(db.Integer, db.ForeignKey("group.id"), nullable=False)
    status_id   = db.Column(db.Integer, db.ForeignKey("status.id"))
    photos      = db.relationship("Photo", backref="pin", cascade="all, delete-orphan")

class Photo(db.Model):
    id     = db.Column(db.Integer, primary_key=True)
    url    = db.Column(db.String(255), nullable=False)
    pin_id = db.Column(db.Integer, db.ForeignKey("pin.id"), nullable=False)

# ------------------------- Helpers -------------------------- #
def allowed_file(name: str) -> bool:
    return "." in name and name.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def compress_and_save(file_storage, group_id: int) -> str:
    fname = file_storage.filename or "upload"
    ext   = fname.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        abort(400, description="Unsupported file type")
    try:
        img = Image.open(file_storage.stream)
    except UnidentifiedImageError:
        abort(400, description="Invalid image")

    if max(img.size) > MAX_DIM_PX:
        img.thumbnail((MAX_DIM_PX, MAX_DIM_PX))

    if ext == "webp":
        fmt = "WEBP"; save_kwargs = {"quality": JPEG_QUALITY, "method": 6}; new_ext = "webp"
    else:
        fmt = "JPEG"; img = img.convert("RGB")
        save_kwargs = {"quality": JPEG_QUALITY, "optimize": True}; new_ext = "jpg"

    subdir = os.path.join(MEDIA_DIR, "groups", str(group_id))
    os.makedirs(subdir, exist_ok=True)

    key  = f"{uuid.uuid4().hex}.{new_ext}"
    path = os.path.join(subdir, key)

    img.save(path, fmt, **save_kwargs)
    return f"{MEDIA_URL_PREFIX}/groups/{group_id}/{key}"

def status_as_dict(s: Status) -> dict:
    return {"id": s.id, "label": s.label, "color": s.color}

def pin_as_dict(p: Pin) -> dict:
    status = Status.query.get(p.status_id)
    return {
        "id": p.id,
        "lat": p.lat,
        "lng": p.lng,
        "description": p.description,
        "upvotes": p.upvotes,
        "status_id": p.status_id,
        "status": status.label if status else None,
        "photos": [ph.url for ph in p.photos],
    }

# --------------------- WebSocket hub ------------------------ #
clients_lock = threading.Lock()
clients = []  # items: {"ws": ws, "slug": "group-slug" or None}

def broadcast_to_slug(slug: str, payload: dict):
    msg = json.dumps(payload, separators=(",", ":"))
    dead = []
    with clients_lock:
        for c in clients:
            if c.get("slug") != slug:
                continue
            ws = c.get("ws")
            try:
                ws.send(msg)
            except Exception:
                dead.append(c)
        for d in dead:
            try: clients.remove(d)
            except ValueError: pass

def broadcast_statuses(g: Group):
    payload = {
        "type": "statuses_changed",
        "slug": g.slug,
        "statuses": [status_as_dict(s) for s in g.statuses]
    }
    broadcast_to_slug(g.slug, payload)

@sock.route('/ws')
def ws_handler(ws):
    me = {"ws": ws, "slug": None}
    with clients_lock: clients.append(me)
    try:
        while True:
            raw = ws.receive()
            if raw is None: break
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if data.get("type") == "subscribe":
                me["slug"] = str(data.get("slug") or "")
                ws.send(json.dumps({"type": "subscribed", "slug": me["slug"]}))
            elif data.get("type") == "ping":
                ws.send('{"type":"pong"}')
    finally:
        with clients_lock:
            try: clients.remove(me)
            except ValueError: pass

# ------------------------- API ----------------------------- #
@app.post("/api/uploads")
def upload_images():
    if "files" not in request.files:
        abort(400, "No files part")
    try:
        group_id = int(request.form.get("group_id", "0"))
    except ValueError:
        abort(400, "Invalid group_id")
    if group_id <= 0:
        abort(400, "group_id required")

    files = request.files.getlist("files")
    urls  = []
    for f in files:
        if f and allowed_file(f.filename):
            urls.append(compress_and_save(f, group_id))
    return jsonify({"urls": urls}), 201

@app.post("/api/pins")
def create_pin():
    data = request.get_json(force=True)
    required = ("group_id", "lat", "lng")
    if not all(k in data for k in required):
        abort(400, "Missing required fields")
    group_id = int(data["group_id"])
    status_id = data.get("status_id")

    # Default to "Pending" if no status provided
    if not status_id:
        pending = Status.query.filter(
            Status.group_id == group_id,
            db.func.lower(Status.label) == 'pending'
        ).first()
        if pending:
            status_id = pending.id
        else:
            # fallback to the first status if exists
            first = Status.query.filter_by(group_id=group_id).order_by(Status.id.asc()).first()
            status_id = first.id if first else None

    pin = Pin(
        description=data.get("description"),
        lat=float(data["lat"]),
        lng=float(data["lng"]),
        group_id=group_id,
        status_id=int(status_id) if status_id else None,
    )
    db.session.add(pin); db.session.commit()

    for url in data.get("photos", []):
        db.session.add(Photo(url=url, pin_id=pin.id))
    db.session.commit()

    g = Group.query.get(pin.group_id)
    if g:
        broadcast_to_slug(g.slug, {
            "type": "pin_created",
            "slug": g.slug,
            "pin": pin_as_dict(pin)
        })

    return jsonify(pin_as_dict(pin)), 201

@app.post("/api/pins/<int:pin_id>/upvote")
def upvote(pin_id):
    pin = Pin.query.get_or_404(pin_id)
    pin.upvotes += 1
    db.session.commit()

    g = Group.query.get(pin.group_id)
    if g:
        broadcast_to_slug(g.slug, {
            "type": "pin_upvoted",
            "slug": g.slug,
            "id": pin.id,
            "upvotes": pin.upvotes
        })
    return jsonify({"id": pin.id, "upvotes": pin.upvotes})

@app.patch("/api/pins/<int:pin_id>")
def update_pin(pin_id):
    pin  = Pin.query.get_or_404(pin_id)
    data = request.get_json(force=True)

    if "status_id" in data:
        pin.status_id = int(data["status_id"]) if data["status_id"] is not None else None
    if "description" in data:
        pin.description = data["description"]
    db.session.commit()

    g = Group.query.get(pin.group_id)
    if g:
        broadcast_to_slug(g.slug, {
            "type": "pin_updated",
            "slug": g.slug,
            "pin": pin_as_dict(pin)
        })
    return jsonify(pin_as_dict(pin))

# -------- Delete an entire group -------- #
@app.delete("/api/groups/<int:group_id>")
def delete_group(group_id):
    g = Group.query.get_or_404(group_id)
    slug = g.slug
    db.session.delete(g)
    db.session.commit()

    # Inform connected WebSocket clients so they can auto‑refresh
    broadcast_to_slug(slug, { "type": "group_deleted", "slug": slug })

    return jsonify({ "ok": True, "deleted": slug }), 200


# --------- Statuses CRUD (group dependent, editable) -------- #
@app.post("/api/groups/<int:group_id>/statuses")
def create_status(group_id):
    g = Group.query.get_or_404(group_id)
    data = request.get_json(force=True)
    label = (data.get("label") or "").strip()
    if not label:
        abort(400, description="label is required")

    color = to_hex(data.get("color"))

    s = Status(label=label, color=color, group_id=g.id)
    db.session.add(s); db.session.commit()

    broadcast_statuses(g)
    return jsonify(status_as_dict(s)), 201


@app.patch("/api/statuses/<int:status_id>")
def update_status(status_id):
    s = Status.query.get_or_404(status_id)
    data = request.get_json(force=True)

    if "label" in data:
        label = (data.get("label") or "").strip()
        if not label:
            abort(400, description="label cannot be empty")
        s.label = label

    if "color" in data:
        s.color = to_hex(data.get("color"))

    db.session.commit()

    g = Group.query.get(s.group_id)
    if g:
        broadcast_statuses(g)
        pins = Pin.query.filter_by(group_id=g.id).all()
        payload = {
            "type": "pins_updated",
            "slug": g.slug,
            "pins": [pin_as_dict(p) for p in pins]
        }
        broadcast_to_slug(g.slug, payload)

    return jsonify(status_as_dict(s))


@app.delete("/api/statuses/<int:status_id>")
def delete_status(status_id):
    s = Status.query.get_or_404(status_id)
    g = Group.query.get_or_404(s.group_id)

    # set pins using this status to NULL
    Pin.query.filter_by(status_id=s.id).update({Pin.status_id: None})
    db.session.delete(s)
    db.session.commit()

    broadcast_statuses(g)
    # after deletion, send updated pins
    pins = Pin.query.filter_by(group_id=g.id).all()
    broadcast_to_slug(g.slug, {
        "type": "pins_updated",
        "slug": g.slug,
        "pins": [pin_as_dict(p) for p in pins]
    })
    return jsonify({"ok": True})

# ---------------------- Read endpoints ---------------------- #
@app.get("/api/groups")
def groups():
    return jsonify([{"id": g.id, "name": g.name, "slug": g.slug} for g in Group.query])

@app.get("/api/media/<path:filename>")
def api_media(filename):
    # Re‑use the same uploads directory
    return send_from_directory(MEDIA_DIR, filename)

@app.post('/api/groups')
def create_group():
    data = request.get_json(force=True)
    name = (data.get('name') or '').strip()
    if not name:
        abort(400, description='name is required')

    base = slugify(name)
    slug = base
    i = 2
    while Group.query.filter_by(slug=slug).first() is not None:
        slug = f'{base}-{i}'; i += 1

    g = Group(name=name, slug=slug)
    db.session.add(g)
    db.session.flush()

    # default statuses
    pending   = Status(label='Pending',   color='#ef4444', group_id=g.id)   # red
    completed = Status(label='Completed', color='#10b981', group_id=g.id)   # green
    db.session.add_all([pending, completed])

    db.session.commit()
    return jsonify({'id': g.id, 'name': g.name, 'slug': g.slug}), 201

@app.get("/api/groups/<string:slug>")
def group(slug):
    g = Group.query.filter_by(slug=slug).first_or_404()
    return jsonify({
        "id": g.id,
        "name": g.name,
        "slug": g.slug,
        "pins": [pin_as_dict(p) for p in g.pins],
        "statuses": [status_as_dict(s) for s in g.statuses]
    })

@app.patch("/api/groups/<int:group_id>")
def update_group(group_id):
    g = Group.query.get_or_404(group_id)
    data = request.get_json(force=True)

    name = (data.get("name") or "").strip()
    slug = (data.get("slug") or "").strip().lower()

    if name:
        g.name = name

    if slug:
        candidate = slugify(slug)
        if candidate != slug:
            slug = candidate
        exists = Group.query.filter(Group.slug == slug, Group.id != g.id).first()
        if exists:
            abort(400, description="Slug already in use")
        g.slug = slug

    db.session.commit()
    return jsonify({"id": g.id, "name": g.name, "slug": g.slug})

# -------------------------- Media --------------------------- #
@app.get(f"{MEDIA_URL_PREFIX}/<path:filename>")
def media(filename):
    return send_from_directory(MEDIA_DIR, filename)

@app.route('/manifest.json')
def manifest():
    return send_from_directory('../frontend/public', 'manifest.json', mimetype='application/manifest+json')

@app.route('/service-worker.js')
def service_worker():
    return send_from_directory('../frontend/public', 'service-worker.js', mimetype='application/javascript')


# --------------------------- CLI ---------------------------- #
@app.cli.command("init-db")
def init_db():
    db.drop_all(); db.create_all()
    print("DB initialised.")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

# NOTE: WebSockets (Flask-Sock)
# - Dev: `flask run` works because Flask-Sock supports the Werkzeug dev server.
# - Prod: use an async server. Recommended:
#     gunicorn -k gevent -w 1 -b 127.0.0.1:5000 app:app
#   (single worker since broadcasts use in-process memory; for multi-worker,
#    add Redis pub/sub and broadcast through it.)
# Docs: Flask-Sock supports Werkzeug, Gunicorn, Eventlet, Gevent.
# https://flask-sock.readthedocs.io/en/latest/web_servers.html
