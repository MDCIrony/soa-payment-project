# Proyecto Arquitectura SOA - Procesador de Órdenes E-Commerce

Este repositorio contiene la entrega completa para la Tarea 2: Crear una infraestructura con estilo de arquitectura SOA.

El proyecto implementa un flujo transaccional de compras (E-Commerce Order Processor) desacoplado en microservicios, coordinado a través de un Bus de Servicios (ESB) central con soporte para transacciones de compensación (Saga Pattern) ante fallas, e integrado con un stack de observabilidad (Prometheus + Loki + Grafana), todo empaquetado y orquestado con Docker.

---

## 📂 Estructura del Repositorio (Desacoplada y Modular)

El código de cada microservicio está estructurado de forma modular (Model-Controller-Routes) para facilitar su mantenimiento y legibilidad:

*   **`client-app/`**: Cliente consumidor (HTML/CSS/JS) servido en Express.
*   **`esb-gateway/`**: Bus de Servicios (ESB) orquestador.
    *   `config/`: Registro lógico de direcciones de servicios.
    *   `controllers/`: Lógica central del patrón Saga y ruteo mediado.
    *   `middlewares/`: Capturador de métricas para Prometheus.
    *   `routes/`: Rutas mapeadas expuestas al cliente.
*   **`inventory-service/`**, **`payment-service/`**, **`notification-service/`**: Microservicios de dominio SOA.
    *   `controllers/`: Implementación del negocio (catálogo, cobros, envío de alertas).
    *   `middlewares/`: Capturador de métricas.
    *   `routes/`: Rutas expuestas bajo contratos OpenAPI.

---

## 🛠️ ¿Cómo funciona la Arquitectura SOA aquí?

Este sistema aplica los principios de la **Arquitectura Orientada a Servicios (SOA)** a través de un **Bus de Servicios (ESB)** que centraliza la comunicación y oculta los detalles de red y localización física:

```mermaid
graph TD
    Client[Cliente / Consumidor] <-->|1. Petición Unificada| ESB[Enterprise Service Bus - ESB]
    
    subgraph Registro e Infraestructura SOA (soa-network)
        ESB <-->|Mapea y Orquesta| Inventory[Servicio de Inventario]
        ESB <-->|Mapea y Orquesta| Payment[Servicio de Pagos]
        ESB -->|Mapea y Enruta| Notification[Servicio de Notificación]
    end

    subgraph Observabilidad Integrada (Monitoreo)
        Prometheus[(Prometheus)] -.->|Scrape /metrics| ESB
        Prometheus -.->|Scrape /metrics| Inventory
        Prometheus -.->|Scrape /metrics| Payment
        
        Promtail[Promtail Agent] -.->|Lee logs de Docker| Loki[(Loki Log DB)]
        Grafana[Grafana Portal] <-->|Consulta datos| Prometheus
        Grafana <-->|Consulta datos| Loki
    end

    style ESB fill:#2563eb,stroke:#1d4ed8,stroke-width:2px,color:#fff
    style Client fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff
    style Inventory fill:#d97706,stroke:#b45309,color:#fff
    style Payment fill:#d97706,stroke:#b45309,color:#fff
    style Notification fill:#d97706,stroke:#b45309,color:#fff
    style Grafana fill:#7c3aed,stroke:#6d28d9,stroke-width:2px,color:#fff
```

---

## 🔄 El Patrón Saga y Flujo de Checkout

En un entorno distribuido, cada microservicio posee su propia base de datos (o almacén en memoria). No podemos usar transacciones ACID de bases de datos relacionales tradicionales. Para garantizar la consistencia, implementamos el **Patrón Saga basado en Orquestación**.

### 1. ¿Cómo funciona la Saga en este proyecto?
El **ESB Gateway** actúa como el orquestador central que ejecuta una secuencia de transacciones locales en cada servicio:

*   **Paso 1: Reserva de Stock** ➡️ El ESB llama a `inventory-service` (`POST /inventory/reserve`). Se aparta el stock temporalmente.
*   **Paso 2: Procesamiento del Pago** ➡️ El ESB calcula el monto y llama a `payment-service` (`POST /payments/charge`).
*   **Paso 3 (Flujo Feliz): Confirmación** ➡️ Si el pago es aprobado, el ESB completa el checkout y llama a `notification-service` (`POST /notifications/send`) para enviar el correo de confirmación.

### 2. Transacción de Compensación (Compensating Transaction)
Si el **Paso 2 (Pago)** falla (por ejemplo, fondos insuficientes o tarjeta declinada):
1.  La Saga detecta el error en el orquestador (bloque catch).
2.  El ESB ejecuta una **transacción de compensación** (rollback lógico) llamando a `inventory-service` (`POST /inventory/release`) para liberar y reintegrar el stock que había sido apartado en el paso 1.
3.  El ESB solicita enviar una alerta de fallo al usuario final (`POST /notifications/send`).

```mermaid
sequenceDiagram
    autonumber
    actor Cliente
    participant ESB as ESB (Bus de Servicios)
    participant IS as Servicio de Inventario
    participant PS as Servicio de Pagos
    participant NS as Servicio de Notificación

    Cliente->>ESB: Enviar Pedido (items, tarjeta, email)
    ESB->>IS: Reservar Stock (POST /inventory/reserve)
    alt Stock no disponible
        IS-->>ESB: Error de Stock (400)
        ESB->>NS: Enviar Notificación de Fallo (Stock Insuficiente)
        ESB-->>Cliente: Checkout Fallido (Sin Stock)
    else Stock reservado exitosamente (200)
        IS-->>ESB: Confirmación de Reserva
        ESB->>PS: Procesar Pago (POST /payments/charge)
        alt Pago Rechazado (Fondos insuficientes, etc)
            PS-->>ESB: Pago Fallido (402)
            Note over ESB,IS: Transacción de Compensación (Rollback)
            ESB->>IS: Liberar Stock Reservado (POST /inventory/release)
            IS-->>ESB: Stock Liberado
            ESB->>NS: Enviar Notificación de Fallo (Pago Declinado)
            ESB-->>Cliente: Checkout Fallido (Pago Rechazado)
        else Pago Aprobado (200)
            PS-->>ESB: Transacción Exitosa
            ESB->>NS: Enviar Notificación de Éxito (Factura / Confirmación)
            ESB-->>Cliente: Compra Exitosa (Orden ID)
        end
    end
```

---

## 📦 Detalle de los 9 Contenedores del Ecosistema y Swagger Docs

Al levantar el proyecto, Docker inicia **9 contenedores** especializados. Los servicios SOA exponen una UI de Swagger interactiva para realizar pruebas directas:

| Contenedor | Rol SOA / Observabilidad | Puerto Host | Endpoint Swagger UI | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| **`client-app`** | Cliente (Consumidor) | `3000` | *N/A* | Dashboard interactivo que simula compras y muestra la traza del ESB en tiempo real. |
| **`esb-gateway`** | Bus de Servicios (ESB) | `4000` | [`http://localhost:4000/docs`](http://localhost:4000/docs) | Gateway, ruteador y orquestador transaccional SAGA. |
| **`inventory-service`**| Proveedor de Servicio | `3001` | [`http://localhost:3001/docs`](http://localhost:3001/docs) | Gestiona el stock físico de productos, reservas y liberaciones. |
| **`payment-service`**  | Proveedor de Servicio | `3002` | [`http://localhost:3002/docs`](http://localhost:3002/docs) | Procesa y simula transacciones financieras (Mock de cobros). |
| **`notification-service`**| Proveedor de Servicio | `3003` | [`http://localhost:3003/docs`](http://localhost:3003/docs) | Encolador e historial de correos de confirmación (Mock de emails). |
| **`prometheus`**       | Monitoreo (Métricas) | `9090` | *N/A* | Recopila latencias y contadores HTTP de los endpoints `/metrics`. |
| **`loki`**             | Monitoreo (Logs DB)  | `3100` | *N/A* | Almacén unificado para buscar y filtrar logs de consola de la red. |
| **`promtail`**         | Agente de Logs       | *Interno*| *N/A* | Lee los logs de `/var/run/docker.sock` y los empuja a Loki. |
| **`grafana`**          | Monitoreo (Dashboard) | `3005` | *N/A* | Interfaz gráfica unificada con datasources de Prometheus y Loki pre-cargados. |

---

## 🚀 Cómo Iniciar la Infraestructura

Ejecuta en tu terminal en la raíz del proyecto:

```bash
docker compose up --build
```

Esto desplegará toda la red. Una vez levantada, puedes acceder a:
*   **App Cliente:** `http://localhost:3000` (Simula compras normales o compras con fallos usando tarjetas que inicien con `4000`).
*   **Grafana Dashboard:** `http://localhost:3005` (Inicia sesión con `admin`/`admin` y explora las métricas en Prometheus y los logs en tiempo real seleccionando el origen de datos Loki y filtrando por contenedor).
*   **Consola Prometheus:** `http://localhost:9090` (Visualización de métricas puras).
