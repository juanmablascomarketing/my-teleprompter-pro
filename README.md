# Teleprompter Pal

Crea una web app (PWA, mobile-first) llamada "Teleprompter Personal".

FUNCIONALIDAD PRINCIPAL:

Pantalla de grabación con la cámara del móvil en tiempo real (usando getUserMedia) 

y, superpuesto encima del vídeo, un bloque de texto en scroll automático que actúa 

como teleprompter mientras grabo.

PANTALLAS:

1. Pantalla de guiones: lista de guiones guardados (localStorage), botón "+ Nuevo guion" 

   que abre un textarea para pegar/escribir texto y guardarlo con un título.

2. Pantalla de grabación:

   - Vista de cámara en tiempo real a pantalla completa

   - Texto del guion superpuesto en la mitad superior/central, con fondo semitransparente 

     oscuro para legibilidad, en scroll vertical automático

   - Control deslizante de velocidad de scroll

   - Slider de tamaño de fuente

   - Botón de "modo espejo" (invierte el texto horizontalmente)

   - Cuenta atrás de 3 segundos antes de iniciar grabación + scroll

   - Botón grabar/detener (usa MediaRecorder API), con indicador de tiempo grabado

   - Al detener, opción de descargar el vídeo (mp4/webm) al dispositivo

   - Botón de pausa para congelar el scroll sin detener la grabación

   - Tap en pantalla para pausar/reanudar el scroll rápidamente

   - Botón para reiniciar el scroll al inicio del guion (sin salir de la pantalla), 

     útil para repetir tomas

CÁMARA:

- Debe soportar cambio entre cámara frontal (selfie) y trasera con un botón/icono 

  visible en la esquina de la pantalla de grabación

- Por defecto debe abrir la cámara frontal (selfie), ya que se usa para grabarse 

  a uno mismo leyendo el guion

- Recordar la última cámara usada como preferencia para la próxima vez que se abra la app

- El botón de cambio de cámara solo está activo antes de iniciar la grabación; 

  una vez pulsado "grabar", el selector de cámara se deshabilita hasta detener el vídeo

COMPORTAMIENTO EN GRABACIÓN:

- Usar la Screen Wake Lock API para evitar que la pantalla se apague o bloquee 

  automáticamente durante la grabación

- Manejar con claridad los permisos de cámara/micrófono: si el usuario los deniega, 

  mostrar un mensaje explicando qué hacer para activarlos

DISEÑO:

- Mobile-first, controles grandes y accesibles con el pulgar

- Tema oscuro para no deslumbrar al grabar

- Debe funcionar bien tanto en vertical como en horizontal

- Respetar los márgenes de pantalla en móviles con notch/isla dinámica

TÉCNICO:

- Guardar guiones en localStorage (no requiere backend)

- Configurar como PWA instalable (manifest + icono)

- Optimizar para que cargue rápido y funcione fluido en móviles de gama media

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://my-teleprompter-pro.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4d860ee5-43f5-4aa6-9a46-015fad4223dd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
