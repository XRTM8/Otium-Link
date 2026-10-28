use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

pub const CAST_DEFAULT_PORT: u16 = 42426;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CastInfo {
    pub is_running: bool,
    pub port: u16,
    pub local_ip: String,
    pub url: String,
    pub pin: String,
    pub connected_viewers: usize,
    pub current_slide: usize,
    pub total_slides: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SlidePayload {
    pub index: usize,
    pub total: usize,
    pub title: String,
    pub text: String,
    pub image_data: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LaserPayload {
    pub x: f32, // 0.0 to 1.0
    pub y: f32, // 0.0 to 1.0
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DrawPayload {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
    pub color: String,
    pub size: f32,
    pub is_end: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MessagePayload {
    pub text: String,
    pub urgent: bool,
}

struct SseClient {
    #[allow(dead_code)]
    id: u64,
    stream: TcpStream,
}

struct CastInner {
    is_running: bool,
    port: u16,
    pin: String,
    current_slide: usize,
    slides: Vec<SlidePayload>,
    #[allow(dead_code)]
    current_text: String,
    laser: LaserPayload,
    active_message: Option<String>,
    clients: Vec<SseClient>,
}

#[derive(Clone)]
pub struct CastManager {
    inner: Arc<Mutex<CastInner>>,
    should_stop: Arc<AtomicBool>,
    next_client_id: Arc<AtomicU64>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

/// Resolves the active private Wi-Fi / LAN IP without external internet queries
pub fn resolve_local_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("192.168.1.1:80").is_ok() || socket.connect("10.0.0.1:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" && ip != "127.0.0.1" {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

impl CastManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(CastInner {
                is_running: false,
                port: CAST_DEFAULT_PORT,
                pin: String::new(),
                current_slide: 0,
                slides: vec![SlidePayload {
                    index: 0,
                    total: 1,
                    title: "مرحباً بكم في العرض التقديمي الذكي".to_string(),
                    text: "تم ربط السبورة الذكية بنجاح مع تطبيق Otium Link. المحاضر يتحكم بالعرض الآن.".to_string(),
                    image_data: None,
                }],
                current_text: String::new(),
                laser: LaserPayload {
                    x: 0.5,
                    y: 0.5,
                    active: false,
                },
                active_message: None,
                clients: Vec::new(),
            })),
            should_stop: Arc::new(AtomicBool::new(false)),
            next_client_id: Arc::new(AtomicU64::new(1)),
            app_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start(&self, pin: Option<String>, app: AppHandle) -> Result<CastInfo, String> {
        if let Ok(mut handle) = self.app_handle.lock() {
            *handle = Some(app.clone());
        }
        let mut inner = self.inner.lock().unwrap();
        if inner.is_running {
            let local_ip = resolve_local_ip();
            let port = inner.port;
            return Ok(CastInfo {
                is_running: true,
                port,
                local_ip: local_ip.clone(),
                url: format!("http://{}:{}", local_ip, port),
                pin: inner.pin.clone(),
                connected_viewers: inner.clients.len(),
                current_slide: inner.current_slide,
                total_slides: inner.slides.len(),
            });
        }

        let assigned_pin = pin.unwrap_or_default();

        inner.pin = assigned_pin.clone();
        inner.is_running = true;
        let port = inner.port;
        drop(inner);

        self.should_stop.store(false, Ordering::SeqCst);

        let listener = TcpListener::bind(format!("0.0.0.0:{}", port))
            .map_err(|e| format!("تعذر فتح منفذ العرض الذكي {}: {}", port, e))?;

        let _ = listener.set_nonblocking(true);

        let manager_clone = self.clone();
        let app_clone = app.clone();
        let stop_flag = self.should_stop.clone();

        thread::spawn(move || {
            while !stop_flag.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((stream, _addr)) => {
                        let manager = manager_clone.clone();
                        let app = app_clone.clone();
                        thread::spawn(move || {
                            manager.handle_http_client(stream, app);
                        });
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(50));
                    }
                    Err(_) => {
                        thread::sleep(Duration::from_millis(50));
                    }
                }
            }
        });

        let local_ip = resolve_local_ip();
        Ok(CastInfo {
            is_running: true,
            port,
            local_ip: local_ip.clone(),
            url: format!("http://{}:{}", local_ip, port),
            pin: assigned_pin,
            connected_viewers: 0,
            current_slide: 0,
            total_slides: 1,
        })
    }

    pub fn stop(&self) {
        self.should_stop.store(true, Ordering::SeqCst);
        let mut inner = self.inner.lock().unwrap();
        inner.is_running = false;
        inner.clients.clear();
    }

    pub fn get_info(&self) -> CastInfo {
        let inner = self.inner.lock().unwrap();
        let local_ip = resolve_local_ip();
        let port = inner.port;
        CastInfo {
            is_running: inner.is_running,
            port,
            local_ip: local_ip.clone(),
            url: format!("http://{}:{}", local_ip, port),
            pin: inner.pin.clone(),
            connected_viewers: inner.clients.len(),
            current_slide: inner.current_slide,
            total_slides: inner.slides.len(),
        }
    }

    pub fn set_slides(&self, mut slides: Vec<SlidePayload>) {
        let mut inner = self.inner.lock().unwrap();
        if !slides.is_empty() {
            // Guard against memory exhaustion DOS
            if slides.len() > 150 {
                slides.truncate(150);
            }
            for slide in &mut slides {
                if slide.title.len() > 250 {
                    slide.title.truncate(250);
                }
                if slide.text.len() > 30000 {
                    slide.text.truncate(30000);
                }
            }
            let total = slides.len();
            for (idx, slide) in slides.iter_mut().enumerate() {
                slide.index = idx;
                slide.total = total;
            }
            inner.slides = slides;
            inner.current_slide = 0;
            self.broadcast_event_locked(&mut inner, "slide");
        }
    }

    pub fn set_slide_index(&self, index: usize) {
        let mut inner = self.inner.lock().unwrap();
        if index < inner.slides.len() {
            inner.current_slide = index;
            self.broadcast_event_locked(&mut inner, "slide");
        }
    }

    pub fn update_laser(&self, x: f32, y: f32, active: bool) {
        let mut inner = self.inner.lock().unwrap();
        inner.laser = LaserPayload { x, y, active };
        self.broadcast_event_locked(&mut inner, "laser");
    }

    pub fn broadcast_draw(&self, payload: DrawPayload) {
        let mut inner = self.inner.lock().unwrap();
        let json = serde_json::to_string(&payload).unwrap_or_default();
        self.broadcast_raw_locked(&mut inner, "draw", &json);
    }

    pub fn broadcast_message(&self, text: String, _urgent: bool) {
        let mut inner = self.inner.lock().unwrap();
        inner.active_message = if text.trim().is_empty() {
            None
        } else {
            Some(text)
        };
        self.broadcast_event_locked(&mut inner, "message");
    }

    pub fn clear_canvas(&self) {
        let mut inner = self.inner.lock().unwrap();
        self.broadcast_raw_locked(&mut inner, "clear", "{}");
    }

    fn broadcast_event_locked(&self, inner: &mut CastInner, event_type: &str) {
        let json = match event_type {
            "slide" => {
                let current = inner
                    .slides
                    .get(inner.current_slide)
                    .cloned()
                    .unwrap_or_else(|| SlidePayload {
                        index: 0,
                        total: 1,
                        title: "عرض Otium".to_string(),
                        text: String::new(),
                        image_data: None,
                    });
                serde_json::to_string(&current).unwrap_or_default()
            }
            "laser" => serde_json::to_string(&inner.laser).unwrap_or_default(),
            "message" => serde_json::to_string(&MessagePayload {
                text: inner.active_message.clone().unwrap_or_default(),
                urgent: true,
            })
            .unwrap_or_default(),
            _ => "{}".to_string(),
        };

        self.broadcast_raw_locked(inner, event_type, &json);
    }

    fn broadcast_raw_locked(&self, inner: &mut CastInner, event_type: &str, data_json: &str) {
        let message = format!("event: {}\ndata: {}\n\n", event_type, data_json);
        let bytes = message.as_bytes();

        let prev_len = inner.clients.len();
        inner.clients.retain_mut(|client| {
            client.stream.write_all(bytes).is_ok() && client.stream.flush().is_ok()
        });
        let new_len = inner.clients.len();

        if prev_len != new_len {
            if let Ok(guard) = self.app_handle.lock() {
                if let Some(ref app) = *guard {
                    let _ = app.emit("otium-link://cast-viewers-updated", new_len);
                }
            }
        }
    }

    fn handle_http_client(&self, mut stream: TcpStream, app: AppHandle) {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let mut buffer = [0u8; 4096];
        let n = match stream.read(&mut buffer) {
            Ok(n) if n > 0 => n,
            _ => return,
        };

        let request = String::from_utf8_lossy(&buffer[..n]);
        let mut lines = request.lines();
        let request_line = match lines.next() {
            Some(l) => l,
            None => return,
        };

        let parts: Vec<&str> = request_line.split_whitespace().collect();
        if parts.len() < 2 {
            return;
        }

        let method = parts[0];
        let path = parts[1];

        if method == "GET" && (path == "/" || path == "/cast" || path.starts_with("/?")) {
            // Serve the self-contained Smart Board Receiver web application
            let pin_expected = {
                let inner = self.inner.lock().unwrap();
                inner.pin.clone()
            };
            let html = generate_smart_board_html(!pin_expected.is_empty());
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
                html.len(),
                html
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            return;
        }

        if method == "GET" && path.starts_with("/events") {
            // Verify PIN security if configured
            let pin_expected = {
                let inner = self.inner.lock().unwrap();
                inner.pin.clone()
            };

            if !pin_expected.is_empty() {
                let mut authorized = false;
                if let Some(query) = path.split('?').nth(1) {
                    for pair in query.split('&') {
                        let mut kv = pair.split('=');
                        if kv.next() == Some("pin") && kv.next() == Some(&pin_expected) {
                            authorized = true;
                            break;
                        }
                    }
                }

                if !authorized {
                    let unauthorized = "HTTP/1.1 401 UNAUTHORIZED\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 25\r\n\r\n{\"error\":\"invalid_pin\"}";
                    let _ = stream.write_all(unauthorized.as_bytes());
                    let _ = stream.flush();
                    return;
                }
            }

            // Server-Sent Events (SSE) Stream
            let _ = stream.set_read_timeout(None);
            let _ = stream.set_write_timeout(Some(Duration::from_millis(150)));

            let headers = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
            if stream.write_all(headers.as_bytes()).is_err() || stream.flush().is_err() {
                return;
            }

            let client_id = self.next_client_id.fetch_add(1, Ordering::SeqCst);

            // Send initial state immediately
            let mut inner = self.inner.lock().unwrap();
            let current_slide_json = serde_json::to_string(
                inner
                    .slides
                    .get(inner.current_slide)
                    .unwrap_or(&SlidePayload {
                        index: 0,
                        total: 1,
                        title: "عرض Otium".to_string(),
                        text: String::new(),
                        image_data: None,
                    }),
            )
            .unwrap_or_default();

            let init_msg = format!("event: slide\ndata: {}\n\n", current_slide_json);
            let _ = stream.write_all(init_msg.as_bytes());
            let _ = stream.flush();

            inner.clients.push(SseClient {
                id: client_id,
                stream,
            });

            let count = inner.clients.len();
            drop(inner);

            let _ = app.emit("otium-link://cast-viewers-updated", count);
            return;
        }

        // 404 Not Found fallback
        let not_found = "HTTP/1.1 404 NOT FOUND\r\nContent-Length: 13\r\n\r\n404 Not Found";
        let _ = stream.write_all(not_found.as_bytes());
    }
}

/// Generates the self-contained, responsive, 100% offline Smart Board Presentation Receiver
fn generate_smart_board_html(has_pin_protection: bool) -> String {
    let pin_req_str = if has_pin_protection { "true" } else { "false" };

    format!(r#"<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Otium Smart Board | شاشة العرض الذكية</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }}
    body {{
      background-color: #050811;
      color: #f0f6fc;
      font-family: system-ui, -apple-system, 'Tajawal', sans-serif;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
    }}
    header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      background: rgba(10, 15, 29, 0.85);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      z-index: 50;
      transition: opacity 0.3s ease;
    }}
    header.hidden-ui {{ opacity: 0; pointer-events: none; }}
    .logo-badge {{
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      font-size: 16px;
      letter-spacing: -0.5px;
    }}
    .status-dot {{
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 12px #10b981;
      animation: pulse 2s infinite;
    }}
    @keyframes pulse {{ 0% {{ opacity: 0.6; }} 50% {{ opacity: 1; }} 100% {{ opacity: 0.6; }} }}
    .controls-group {{ display: flex; align-items: center; gap: 12px; }}
    .btn {{
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #f0f6fc;
      padding: 8px 16px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }}
    .btn:hover {{ background: rgba(255, 255, 255, 0.12); border-color: rgba(16, 185, 129, 0.4); }}
    main {{
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      overflow: hidden;
    }}
    #slideContainer {{
      max-width: 92%;
      max-height: 88%;
      width: auto;
      height: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 40px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
      z-index: 10;
    }}
    #slideImage {{
      max-width: 100%;
      max-height: 75vh;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      object-fit: contain;
      display: none;
    }}
    #slideTitle {{
      font-size: 38px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 20px;
      text-align: center;
      line-height: 1.3;
    }}
    #slideText {{
      font-size: 22px;
      color: #cbd5e1;
      line-height: 1.8;
      text-align: center;
      max-width: 900px;
      white-space: pre-wrap;
    }}
    #slideNumber {{
      position: absolute;
      bottom: 16px;
      left: 24px;
      font-family: monospace;
      font-size: 13px;
      font-weight: bold;
      color: #10b981;
      background: rgba(16, 185, 129, 0.12);
      padding: 4px 12px;
      border-radius: 9999px;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }}
    /* Live Drawing Annotation Canvas */
    #drawCanvas {{
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 40;
    }}
    /* Virtual Laser Pointer Dot */
    #laserDot {{
      position: absolute;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #ff1100;
      box-shadow: 0 0 16px 6px #ff1100, 0 0 35px 12px rgba(255, 17, 0, 0.7);
      pointer-events: none;
      z-index: 100;
      transform: translate(-50%, -50%);
      transition: opacity 0.15s ease, transform 0.05s ease-out;
      opacity: 0;
    }}
    #laserDot.active {{ opacity: 1; }}
    /* Urgent Broadcast Banner */
    #alertBanner {{
      position: absolute;
      top: 30px;
      left: 50%;
      transform: translateX(-50%) translateY(-100px);
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95));
      color: #fff;
      padding: 16px 36px;
      border-radius: 20px;
      font-size: 20px;
      font-weight: bold;
      box-shadow: 0 20px 40px rgba(239, 68, 68, 0.4);
      z-index: 90;
      transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      border: 1px solid rgba(255,255,255,0.2);
    }}
    #alertBanner.show {{ transform: translateX(-50%) translateY(0); }}
    /* PIN Prompt Modal */
    #pinModal {{
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(20px);
      z-index: 200;
      align-items: center;
      justify-content: center;
    }}
    .pin-box {{
      background: #0f172a;
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 36px 32px;
      border-radius: 28px;
      max-width: 380px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0,0,0,0.8);
    }}
    .pin-input {{
      width: 100%;
      padding: 14px;
      margin: 18px 0;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(0,0,0,0.5);
      color: #10b981;
      font-size: 24px;
      font-family: monospace;
      letter-spacing: 8px;
      text-align: center;
      outline: none;
    }}
  </style>
</head>
<body>
  <div id="laserDot"></div>
  <div id="alertBanner"></div>
  <canvas id="drawCanvas"></canvas>

  <header id="headerBar">
    <div class="logo-badge">
      <div class="status-dot"></div>
      <span>شاشة العرض الذكية | Otium Smart Cast</span>
    </div>

    <div class="controls-group">
      <button class="btn" onclick="clearLocalCanvas()">
        <span>🧹 مسح الشاشة</span>
      </button>
      <button class="btn" id="btnFullscreen" onclick="toggleFullscreen()">
        <span>⛶ ملء الشاشة الكامل</span>
      </button>
      <button class="btn" onclick="toggleUI()">
        <span>👁 إخفاء الشريط</span>
      </button>
    </div>
  </header>

  <main onclick="toggleUI()">
    <div id="slideContainer">
      <img id="slideImage" alt="شريحة العرض" />
      <h1 id="slideTitle">مرحباً بكم في العرض التقديمي</h1>
      <p id="slideText">تم الاتصال بالسبورة بنجاح. المحاضر يتحكم بالشرائح من جهازه الآن.</p>
      <div id="slideNumber">1 / 1</div>
    </div>
  </main>

  <div id="pinModal">
    <div class="pin-box">
      <div style="font-size: 40px; margin-bottom: 12px;">🔒</div>
      <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 8px;">جلسة عرض محمية</h2>
      <p style="font-size: 13px; color: #94a3b8;">أدخل رمز PIN الظاهر على شاشة المحاضر للبدء:</p>
      <div id="pinError" style="display: none; color: #f87171; font-size: 13px; font-weight: bold; margin-top: 10px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 12px; border-radius: 12px;">رمز PIN غير صحيح، يرجى المحاولة مرة أخرى</div>
      <input type="text" id="pinInput" class="pin-input" placeholder="1234" maxlength="6" />
      <button class="btn" style="width: 100%; justify-content: center; background: #10b981; color: #022c22; font-weight: 800; padding: 12px;" onclick="submitPin()">
        اتصال بالعرض
      </button>
    </div>
  </div>

  <script>
    const pinRequired = {pin_req_str};
    const laserDot = document.getElementById('laserDot');
    const slideContainer = document.getElementById('slideContainer');
    const slideImage = document.getElementById('slideImage');
    const slideTitle = document.getElementById('slideTitle');
    const slideText = document.getElementById('slideText');
    const slideNumber = document.getElementById('slideNumber');
    const alertBanner = document.getElementById('alertBanner');
    const headerBar = document.getElementById('headerBar');
    const drawCanvas = document.getElementById('drawCanvas');
    const ctx = drawCanvas.getContext('2d');
    const pinModal = document.getElementById('pinModal');
    const pinInput = document.getElementById('pinInput');

    function resizeCanvas() {{
      drawCanvas.width = window.innerWidth;
      drawCanvas.height = window.innerHeight;
    }}
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function clearLocalCanvas() {{
      ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }}

    let uiHidden = false;
    function toggleUI() {{
      uiHidden = !uiHidden;
      headerBar.classList.toggle('hidden-ui', uiHidden);
    }}

    function toggleFullscreen() {{
      if (!document.fullscreenElement) {{
        document.documentElement.requestFullscreen().catch(() => {{}});
      }} else {{
        document.exitFullscreen().catch(() => {{}});
      }}
    }}

    // Keyboard Shortcuts for Presenters and Teachers
    window.addEventListener('keydown', (e) => {{
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'h' || e.key === 'H') toggleUI();
      if (e.key === 'c' || e.key === 'C') clearLocalCanvas();
    }});

    let currentSse = null;

    function submitPin() {{
      const pin = pinInput.value.trim();
      if (pin) {{
        initEventStream(pin);
      }}
    }}

    function initEventStream(overridePin) {{
      if (currentSse) {{
        try {{ currentSse.close(); }} catch (_) {{}}
        currentSse = null;
      }}

      const savedPin = overridePin || sessionStorage.getItem('otium_cast_pin') || '';
      const streamUrl = savedPin ? `/events?pin=${{encodeURIComponent(savedPin)}}` : '/events';
      const sse = new EventSource(streamUrl);
      currentSse = sse;

      sse.addEventListener('slide', (e) => {{
        if (savedPin) {{
          sessionStorage.setItem('otium_cast_pin', savedPin);
        }}
        pinModal.style.display = 'none';
        const errEl = document.getElementById('pinError');
        if (errEl) errEl.style.display = 'none';

        try {{
          const data = JSON.parse(e.data);
          slideContainer.style.opacity = '0';
          setTimeout(() => {{
            slideTitle.innerText = data.title || '';
            slideText.innerText = data.text || '';
            slideNumber.innerText = `${{data.index + 1}} / ${{data.total}}`;

            if (data.image_data) {{
              slideImage.src = data.image_data;
              slideImage.style.display = 'block';
              if (!data.text) slideText.style.display = 'none';
            }} else {{
              slideImage.style.display = 'none';
              slideText.style.display = 'block';
            }}
            slideContainer.style.opacity = '1';
          }}, 150);
        }} catch (err) {{
          console.error('Slide parse error', err);
        }}
      }});

      sse.addEventListener('laser', (e) => {{
        try {{
          const laser = JSON.parse(e.data);
          if (laser.active) {{
            laserDot.classList.add('active');
            laserDot.style.left = `${{laser.x * 100}}%`;
            laserDot.style.top = `${{laser.y * 100}}%`;
          }} else {{
            laserDot.classList.remove('active');
          }}
        }} catch (_) {{}}
      }});

      sse.addEventListener('draw', (e) => {{
        try {{
          const d = JSON.parse(e.data);
          const w = drawCanvas.width;
          const h = drawCanvas.height;
          ctx.strokeStyle = d.color || '#ef4444';
          ctx.lineWidth = (d.size || 3.0) * (w / 1200);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(d.x0 * w, d.y0 * h);
          ctx.lineTo(d.x1 * w, d.y1 * h);
          ctx.stroke();
        }} catch (_) {{}}
      }});

      sse.addEventListener('clear', () => {{
        clearLocalCanvas();
      }});

      sse.addEventListener('message', (e) => {{
        try {{
          const msg = JSON.parse(e.data);
          if (msg.text && msg.text.trim()) {{
            alertBanner.innerText = msg.text;
            alertBanner.classList.add('show');
            setTimeout(() => alertBanner.classList.remove('show'), 6000);
          }}
        }} catch (_) {{}}
      }});

      sse.onerror = (err) => {{
        console.warn('SSE disconnected or unauthorized', err);
        sessionStorage.removeItem('otium_cast_pin');
        try {{ sse.close(); }} catch (_) {{}}
        currentSse = null;
        if (pinRequired) {{
          pinModal.style.display = 'flex';
          const errEl = document.getElementById('pinError');
          if (errEl) errEl.style.display = 'block';
          pinInput.value = '';
          pinInput.focus();
        }}
      }};
    }}

    window.addEventListener('DOMContentLoaded', () => {{
      const savedPin = sessionStorage.getItem('otium_cast_pin');
      if (pinRequired && !savedPin) {{
        pinModal.style.display = 'flex';
        pinInput.focus();
      }} else {{
        initEventStream(savedPin);
      }}
    }});
  </script>
</body>
</html>"#, pin_req_str = pin_req_str)
}
