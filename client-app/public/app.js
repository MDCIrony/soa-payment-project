let esbUrl = 'http://localhost:4000'; // Valor por defecto

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  await fetchConfig();
  await loadCatalog();
  await loadNotifications();

  document.getElementById('btn-refresh-notifications').addEventListener('click', loadNotifications);
});

// Obtener configuración dinámica
async function fetchConfig() {
  try {
    const res = await fetch('/config');
    const data = await res.json();
    esbUrl = data.esbUrl;
    console.log('[Client] ESB URL configurada:', esbUrl);
  } catch (err) {
    console.warn('[Client] No se pudo cargar config, usando defaults:', err);
  }
}

// Cargar catálogo desde el ESB
async function loadCatalog() {
  const container = document.getElementById('catalog-container');
  try {
    const res = await fetch(`${esbUrl}/api/catalog`);
    if (!res.ok) throw new Error('Error al conectar con el ESB');
    
    const products = await res.json();
    container.innerHTML = '';
    
    products.forEach(product => {
      const item = document.createElement('div');
      item.className = 'product-item';
      
      const isOutOfStock = product.stock <= 0;
      
      item.innerHTML = `
        <div class="product-details">
          <h3>${product.name}</h3>
          <p class="product-price">$${product.price.toFixed(2)}</p>
          <p class="product-stock ${isOutOfStock ? 'out-of-stock' : ''}">
            ${isOutOfStock ? 'Agotado' : `Stock disponible: ${product.stock}`}
          </p>
        </div>
        <button class="btn-primary" onclick="checkout('${product.id}')" ${isOutOfStock ? 'disabled' : ''}>
          Comprar
        </button>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = `<div class="error-text" style="color: #ef4444; text-align: center; padding: 1rem;">
      No se pudo establecer conexión con el ESB Gateway.<br>
      <small style="color: #6b7280; font-family: monospace;">Detalle: ${err.message}</small>
    </div>`;
  }
}

// Orquestación de Checkout
async function checkout(productId) {
  const email = document.getElementById('checkout-email').value;
  const cardNumber = document.getElementById('checkout-card').value;
  const timeline = document.getElementById('esb-trace-container');

  if (!email || !cardNumber) {
    alert('Por favor ingresa tu correo y número de tarjeta para simular la compra.');
    return;
  }

  // Limpiar timeline y mostrar inicio
  timeline.innerHTML = '';
  timeline.classList.remove('empty');
  
  // Agregar paso local inicial
  addTimelineStep(timeline, 'Inicio Checkout', 'pending', 'Generando solicitud en el Cliente...');

  // Deshabilitar botones de compra durante la petición
  const buyButtons = document.querySelectorAll('.product-item button');
  buyButtons.forEach(btn => btn.disabled = true);

  try {
    // Realizar llamada al ESB
    const res = await fetch(`${esbUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity: 1, email, cardNumber })
    });

    const data = await res.json();
    
    // Renderizar los pasos devueltos por el ESB
    timeline.innerHTML = ''; // Limpiar pre-solicitud local
    if (data.steps && data.steps.length > 0) {
      data.steps.forEach(step => {
        addTimelineStep(timeline, step.name, step.status, step.details);
      });
    }

    // Agregar paso final
    if (res.ok && data.success) {
      addTimelineStep(timeline, 'Resultado Final', 'success', '¡Compra Exitosa! El ESB completó el flujo Saga.');
    } else {
      const status = res.status === 402 ? 'failed' : 'failed';
      addTimelineStep(timeline, 'Resultado Final', status, `Checkout Cancelado: ${data.message}`);
    }

  } catch (err) {
    addTimelineStep(timeline, 'Error de Conexión', 'failed', `El bus ESB no respondió: ${err.message}`);
  } finally {
    // Habilitar de nuevo el catálogo
    await loadCatalog();
    // Actualizar logs de notificaciones
    await loadNotifications();
  }
}

// Renderizar un paso en la línea de tiempo
function addTimelineStep(container, title, status, details) {
  const step = document.createElement('div');
  step.className = `timeline-step ${status}`;
  
  let icon = '⚡';
  if (status === 'success') icon = '✓';
  if (status === 'failed') icon = '✗';
  if (status === 'warning') icon = '⚠';

  step.innerHTML = `
    <div class="step-icon">${icon}</div>
    <div class="step-content">
      <div class="step-title">
        <span>${title}</span>
        <span class="step-time">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="step-details">${details}</div>
    </div>
  `;
  container.appendChild(step);
  container.scrollTop = container.scrollHeight;
}

// Cargar Notificaciones desde el ESB
async function loadNotifications() {
  const container = document.getElementById('notifications-container');
  try {
    const res = await fetch(`${esbUrl}/api/notifications`);
    if (!res.ok) throw new Error();
    
    const notifications = await res.json();
    
    if (notifications.length === 0) {
      container.innerHTML = '<div class="terminal-line placeholder">Esperando eventos de notificación...</div>';
      return;
    }
    
    container.innerHTML = '';
    notifications.forEach(n => {
      const line = document.createElement('div');
      line.className = 'terminal-line';
      line.innerHTML = `
        [${new Date(n.timestamp).toLocaleTimeString()}] 
        Para: <span class="to">&lt;${n.to}&gt;</span> | 
        Asunto: <span class="subject">${n.subject}</span>
        <span class="body">${n.body}</span>
      `;
      container.appendChild(line);
    });
  } catch (err) {
    container.innerHTML = '<div class="terminal-line placeholder" style="color: #ef4444;">No se pudo conectar con el canal de notificaciones.</div>';
  }
}
