#!/usr/bin/env python3
"""Quick test script to verify HuggingFace API configuration."""
import os
import sys
import httpx

HF_API_KEY = os.environ.get("HF_API_KEY", "")
HF_MODEL = os.environ.get("HF_MODEL", "stabilityai/stable-diffusion-3.5-large-turbo")
HF_API_BASE = "https://router.huggingface.co/hf-inference/models"

print(f"HF_API_KEY: {HF_API_KEY[:12]}..." if HF_API_KEY else "HF_API_KEY: (not set)")
print(f"HF_MODEL: {HF_MODEL}")
print()

# Test 1: With /text-to-image suffix
endpoint1 = f"{HF_API_BASE}/{HF_MODEL}/text-to-image"
print(f"Test 1 - Endpoint with suffix: {endpoint1}")
try:
    resp = httpx.post(
        endpoint1,
        headers={
            "Authorization": f"Bearer {HF_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"inputs": "a cat"},
        timeout=10.0,
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"  Response: {resp.text[:200]}")
except Exception as e:
    print(f"  Error: {e}")
print()

# Test 2: Without suffix
endpoint2 = f"{HF_API_BASE}/{HF_MODEL}"
print(f"Test 2 - Endpoint without suffix: {endpoint2}")
try:
    resp = httpx.post(
        endpoint2,
        headers={
            "Authorization": f"Bearer {HF_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"inputs": "a cat"},
        timeout=10.0,
    )
    print(f"  Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"  Response: {resp.text[:200]}")
except Exception as e:
    print(f"  Error: {e}")
