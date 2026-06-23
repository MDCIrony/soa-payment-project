# Proyecto Arquitectura SOA - Procesador de Órdenes E-Commerce

Este repositorio contiene la entrega completa para la Tarea 2: Crear una infraestructura con estilo de arquitectura SOA.

El proyecto implementa un flujo transaccional de compras (E-Commerce Order Processor) desacoplado en microservicios, coordinado a través de un Bus de Servicios (ESB) central con soporte para transacciones de compensación (Saga Pattern) ante fallas, e integrado con un stack de observabilidad (Prometheus + Loki + Grafana), todo empaquetado y orquestado con Docker.

---

## 📂 Estructura del Repositorio

*   **Código de la Solución**:
    *   [`esb-gateway/`](file:///home/mdcast/Escritorio/PrivateProjects/arquitectura/soa-project/esb-gateway): Bus de Servicios (ESB) en Node.js (registro de servicios, mediación, orquestación SAGA). Expone documentación Swagger en `/docs`.
    *   [`inventory-service/`](file:///home/mdcast/Escritorio/PrivateProjects/arquitectura/soa-project/inventory-service): Microservicio de catálogo e inventario. Expone documentación Swagger en `/docs`.
    *   [`payment-service/`](file:///home/mdcast/Escritorio/PrivateProjects/arquitectura/soa-project/payment-service): Microservicio de procesamiento de cobros (mock). Expone documentación Swagger en `/docs`.
    *   [`notification-service/`](file:///home/mdcast/Escritorio/PrivateProjects/arquitectura/soa-project/notification-service): Microservicio de alertas (mock). Expone documentación Swagger en `/docs`.
    *   [`client-app/`](file:///home/mdcast/Escritorio/PrivateProjects/arquitectura/soa-project/client-app): Cliente web interactivo en HTML/CSS/JS con traza visual del ESB.
    *   [`docker-compose.yml`](file:///home/mdcast/Escritorio/PrivateProjects/arquitectura/soa-project/docker-compose.yml): Archivo de orquestación de red y contenedores.

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

*El ESB centraliza las integraciones y orquesta de forma secuencial y coordinada a los microservicios, además de manejar las transacciones de compensación ante fallos del flujo.*

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
