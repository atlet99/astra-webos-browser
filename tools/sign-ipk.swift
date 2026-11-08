import Foundation
import Security
import CommonCrypto

func fail(_ message: String, _ code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code)
}

guard CommandLine.arguments.count == 3 else {
    fail("Usage: sign-ipk.swift <identity-name> <ipk>")
}
let name = CommandLine.arguments[1]
let path = CommandLine.arguments[2]
let query: [String: Any] = [
    kSecClass as String: kSecClassIdentity,
    kSecReturnRef as String: true,
    kSecMatchLimit as String: kSecMatchLimitAll
]
var result: CFTypeRef?
let status = SecItemCopyMatching(query as CFDictionary, &result)
if status == errSecItemNotFound { fail("Signing identity not found: " + name, 3) }
guard status == errSecSuccess, let identities = result as? [SecIdentity] else {
    fail("Keychain lookup failed: \(status)")
}
let matches = identities.filter { identity in
    var cert: SecCertificate?
    return SecIdentityCopyCertificate(identity, &cert) == errSecSuccess &&
        cert != nil && (SecCertificateCopySubjectSummary(cert!) as String?) == name
}
guard matches.count == 1 else {
    fail(matches.isEmpty ? "Signing identity not found: " + name : "Multiple signing identities found: " + name, matches.isEmpty ? 3 : 1)
}
var privateKey: SecKey?
var cert: SecCertificate?
guard SecIdentityCopyPrivateKey(matches[0], &privateKey) == errSecSuccess, let key = privateKey,
      SecIdentityCopyCertificate(matches[0], &cert) == errSecSuccess, let certificate = cert else {
    fail("Cannot access Keychain signing identity")
}
guard let attributes = SecKeyCopyAttributes(key) as? [String: Any],
      attributes[kSecAttrKeyType as String] as? String == (kSecAttrKeyTypeRSA as String),
      attributes[kSecAttrKeySizeInBits as String] as? Int == 3072 else {
    fail("Signing key must be RSA 3072-bit")
}
guard let input = InputStream(fileAtPath: path) else { fail("Cannot open IPK: " + path) }
input.open()
defer { input.close() }
var hash = CC_SHA256_CTX()
CC_SHA256_Init(&hash)
var buffer = [UInt8](repeating: 0, count: 65536)
while true {
    let n = input.read(&buffer, maxLength: buffer.count)
    if n < 0 { fail("Cannot read IPK: " + (input.streamError?.localizedDescription ?? path)) }
    if n == 0 { break }
    _ = CC_SHA256_Update(&hash, buffer, CC_LONG(n))
}
var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
CC_SHA256_Final(&digest, &hash)
var error: Unmanaged<CFError>?
guard let signature = SecKeyCreateSignature(key, .rsaSignatureDigestPKCS1v15SHA256, Data(digest) as CFData, &error) as Data? else {
    fail("Keychain signing failed: " + (error?.takeRetainedValue().localizedDescription ?? "unknown error"))
}
let der = SecCertificateCopyData(certificate) as Data
let pem = "-----BEGIN CERTIFICATE-----\n" + der.base64EncodedString(options: [.lineLength64Characters, .endLineWithLineFeed]) + "\n-----END CERTIFICATE-----\n"
do {
    try signature.write(to: URL(fileURLWithPath: path + ".sig"), options: .atomic)
    try pem.write(toFile: path + ".cert.pem", atomically: true, encoding: .utf8)
} catch { fail("Cannot write signature: \(error)") }
