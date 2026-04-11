import socket
import sys

def test_bind(host, port):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind((host, port))
        s.listen(1)
        actual_port = s.getsockname()[1]
        print(f"SUCCESS: Bound to {host}:{actual_port}")
        s.close()
    except Exception as e:
        print(f"FAILED: Binding to {host}:{port} - {e}")

print("Testing 127.0.0.1:0")
test_bind("127.0.0.1", 0)

print("Testing 0.0.0.0:0")
test_bind("0.0.0.0", 0)

print("Testing localhost:0")
try:
    test_bind("localhost", 0)
except Exception as e:
    print(f"FAILED: localhost resolution - {e}")
