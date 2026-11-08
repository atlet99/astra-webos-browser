#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/astra-sign-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
printf 'test IPK content\n' > "$WORK/test.ipk"
sh "$ROOT/tools/sign-ipk.sh" "$WORK/test.ipk"
openssl x509 -in "$WORK/test.ipk.cert.pem" -pubkey -noout > "$WORK/public.pem"
openssl dgst -sha256 -verify "$WORK/public.pem" -signature "$WORK/test.ipk.sig" "$WORK/test.ipk"
printf 'modified\n' >> "$WORK/test.ipk"
if openssl dgst -sha256 -verify "$WORK/public.pem" -signature "$WORK/test.ipk.sig" "$WORK/test.ipk" >/dev/null 2>&1; then
    printf 'Modified IPK unexpectedly verified\n' >&2
    exit 1
fi
printf 'Signing and tamper detection passed.\n'
