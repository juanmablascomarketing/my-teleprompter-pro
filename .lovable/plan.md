# Diagnóstico de estabilidad de vídeo y captura vertical

## Objetivo
Aislar si la corrupción de grabaciones largas proviene del códec o de la carga sostenida, sin perder el perfil final vertical para reels.

## Cambios
- Definir dos perfiles seleccionables antes de grabar:
  - **Vertical final:** captura ideal 1080×1920 a 30 fps.
  - **Prueba estable:** captura ideal 720×1280 a 30 fps, VP8 + Opus y 4 Mbps.
- Priorizar explícitamente `video/webm;codecs=vp8,opus` para la prueba y usar `MediaRecorder.isTypeSupported()` para detectar VP8, VP9, H.264/MP4 y WebM genérico.
- Mostrar en pantalla el soporte detectado, el MIME realmente elegido por `MediaRecorder`, y la resolución/orientación real devuelta por `getSettings()`.
- Reiniciar la cámara al cambiar de perfil para que las nuevas constraints se apliquen antes de grabar.
- Instrumentar `ondataavailable`: contar chunks totales, vacíos y anormalmente pequeños, registrar las anomalías en consola y mostrar un resumen durante y al finalizar.
- Mantener un único `MediaRecorder`, el stream combinado de vídeo y audio, y la creación de la descarga exclusivamente tras completar `onstop`.

## Validación
- Verificar tipos y compilación automática del proyecto.
- Simular en navegador soporte de códecs, cámara vertical y chunks para comprobar que la interfaz informa correctamente del perfil, MIME, resolución y anomalías.
- La prueba física de 2 minutos y apertura del archivo en un reproductor normal debe realizarse en el móvil objetivo; el navegador del entorno no puede confirmar la estabilidad del encoder físico del dispositivo.
