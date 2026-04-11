import http.server
import socketserver

PORT = 63315
Handler = http.server.SimpleHTTPRequestHandler

try:
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Server started at 127.0.0.1:{PORT}")
except Exception as e:
    print(f"Error binding to {PORT}: {e}")

PORT_RANDOM = 0
try:
    with socketserver.TCPServer(("127.0.0.1", PORT_RANDOM), Handler) as httpd:
        actual_port = httpd.socket.getsockname()[1]
        print(f"Server started at 127.0.0.1:{actual_port}")
except Exception as e:
    print(f"Error binding to random port: {e}")
