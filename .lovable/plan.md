# Diagnóstico de permisos de cámara

## Cambios
- Separar la apertura de vídeo y audio en dos llamadas independientes a `getUserMedia`.
- Solicitar temporalmente la cámara con el constraint mínimo `{ video: true, audio: false }`, sin `facingMode`, resolución ni `deviceId`.
- Registrar cada fallo con `console.error`, incluyendo nombre, mensaje y constraint usado.
- Mostrar esos mismos detalles en la pantalla de grabación, diferenciando claramente el error de cámara del error de micrófono.
- Combinar las pistas obtenidas en un único `MediaStream` para conservar la grabación con vídeo y audio cuando ambos permisos funcionen.
- Mantener el selector de cámara desactivado durante la grabación; mientras dure este diagnóstico, su reintento también usará vídeo básico.

## Validación
- Comprobar que la ruta de grabación renderiza sin errores.
- Verificar con medios simulados que la cámara básica llega al elemento de vídeo y que los controles siguen disponibles.
- Confirmar visualmente que, al fallar vídeo o audio, aparece el error técnico real en la interfaz.

## Código actual relevante
```ts
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: true,
});
```

Actualmente vídeo y audio se solicitan juntos, no en dos llamadas separadas. El cambio propuesto los separa para identificar exactamente cuál falla.
