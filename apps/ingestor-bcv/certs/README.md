# Bundle de CA anclado para bcv.org.ve (ADR-0006)

`bcv-ca-bundle.pem` contiene la cadena de certificación **real** del certificado
de `www.bcv.org.ve`, capturada y verificada el 2026-07-05:

1. Intermedia: `Sectigo Public Server Authentication CA DV R36` (emisor del leaf).
2. Raíz: `Sectigo Public Server Authentication Root R46` (autofirmada + variantes
   cross-firmadas por USERTrust y AAA Certificate Services).

## Por qué existe

El servidor del BCV envía una cadena TLS incompleta/incorrecta (presenta una
intermedia que no corresponde al emisor del certificado), por lo que la
validación contra el truststore del sistema falla con
`unable to verify the first certificate`. Este bundle completa la cadena
correcta y **ancla** la CA esperada. Nunca se desactiva la verificación TLS.

## Cómo regenerarlo (al rotar el certificado del BCV)

```sh
# 1. Leaf actual y URL de su emisor (campo AIA "CA Issuers")
echo | openssl s_client -connect www.bcv.org.ve:443 -servername www.bcv.org.ve \
  -showcerts 2>/dev/null | awk '/BEGIN CERT/{n++} n==1' > leaf.pem
openssl x509 -in leaf.pem -noout -text | grep -A2 "Authority Information Access"

# 2. Descargar intermedia (URL del paso anterior) y su raíz, convertir a PEM
curl -s http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt -o inter.der
openssl x509 -inform DER -in inter.der -out inter.pem
curl -s http://crt.sectigo.com/SectigoPublicServerAuthenticationRootR46.p7c -o root.p7c
openssl pkcs7 -inform DER -in root.p7c -print_certs -out root.pem

# 3. Construir y VERIFICAR antes de versionar
cat inter.pem root.pem > bcv-ca-bundle.pem
openssl verify -CAfile bcv-ca-bundle.pem leaf.pem   # debe imprimir: leaf.pem: OK
```

Si la verificación del paso 3 falla, NO commitear el bundle: investigar si el
BCV cambió de CA (revisar el emisor del leaf) o si hay un intento de MITM.
