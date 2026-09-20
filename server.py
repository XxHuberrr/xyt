#!/usr/bin/env python3
"""Tiny dependency-free server for the local 四维播放器 demo."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")


def main():
    parser = argparse.ArgumentParser(description="Serve the 四维播放器 demo")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    handler = lambda *a, **kw: QuietHandler(*a, directory=str(root), **kw)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"四维播放器已启动: http://127.0.0.1:{args.port}/")
    print("按 Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
