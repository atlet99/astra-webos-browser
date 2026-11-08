#!/bin/sh
# Detached RSA-SHA256 signature using macOS Keychain identity.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
NAME="${ASTRA_SIGN_IDENTITY:-ASTRA IPK Signing}"

if [ "${1:-}" = "--init" ]; then
    if security find-certificate -c "$NAME" >/dev/null 2>&1; then
        printf 'Certificate already exists for %s; refusing to replace it.\n' "$NAME" >&2
        exit 1
    fi
    umask 077
    WORK="$(mktemp -d "${TMPDIR:-/tmp}/astra-sign.XXXXXX")"
    trap 'rm -rf "$WORK"' EXIT HUP INT TERM
    PASSWORD="$(openssl rand -hex 24)"
    openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 18263 \
        -subj "/CN=$NAME" -keyout "$WORK/private.pem" -out "$WORK/cert.pem" >/dev/null 2>&1
    openssl pkcs12 -export -legacy -inkey "$WORK/private.pem" -in "$WORK/cert.pem" \
        -name "$NAME" -passout "pass:$PASSWORD" -out "$WORK/identity.p12"
    security import "$WORK/identity.p12" -P "$PASSWORD" -x
    printf 'Created Keychain identity: %s (18263 days).\n' "$NAME"
    exit 0
fi

IPK="${1:?Usage: sign-ipk.sh --init | <ipk>}"
test -f "$IPK" || { printf 'IPK not found: %s\n' "$IPK" >&2; exit 1; }
rm -f "$IPK.sig" "$IPK.cert.pem"
if ! swift "$ROOT/tools/sign-ipk.swift" "$NAME" "$IPK"; then
    rm -f "$IPK.sig" "$IPK.cert.pem"
    printf 'Signing failed. To create the identity once: sh "%s/tools/sign-ipk.sh" --init\n' "$ROOT" >&2
    exit 1
fi
if ! openssl x509 -in "$IPK.cert.pem" -checkend 0 -noout >/dev/null ||
   ! openssl x509 -in "$IPK.cert.pem" -pubkey -noout | openssl dgst -sha256 -verify /dev/stdin -signature "$IPK.sig" "$IPK"; then
    rm -f "$IPK.sig" "$IPK.cert.pem"
    printf 'Signature verification failed.\n' >&2
    exit 1
fi
printf 'Signature: %s.sig\nCertificate: %s.cert.pem\n' "$IPK" "$IPK"
