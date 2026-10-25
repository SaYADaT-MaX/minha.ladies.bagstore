import { auth, db } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/* =========================================
   MINHA LADIES BAG — ADMIN DASHBOARD
========================================= */

const ADMIN_UID = "utwqpe1ozLNCFKivDm6LKQonNM62";

const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled"
];

const PAYMENT_STATUSES = [
  "unpaid",
  "pending",
  "paid",
  "failed",
  "refunded"
];

const STATUS_COLORS = {
  pending: "#d9a441",
  confirmed: "#4d8ed6",
  processing: "#9575cd",
  shipped: "#2598a5",
  delivered: "#32976b",
  cancelled: "#d85b5b"
};

let productsCache = [];
let ordersCache = [];
let paymentSettings = {};
let editingProductId = null;
let loading = false;

/* =========================================
   HELPERS
========================================= */

function $(id) {
  return document.getElementById(id);
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function money(value) {
  const amount = Number(value);
  return "৳" + (Number.isFinite(amount) ? amount : 0).toLocaleString("en-BD");
}

function showMessage(message, isError = false) {
  const el = $("message");

  if (!el) return;

  el.textContent = message;
  el.style.color = isError ? "#c0392b" : "#27734a";
}

function formatDate(value) {
  if (!value) return "—";

  let date;

  if (typeof value.toDate === "function") {
    date = value.toDate();
  } else if (typeof value === "number") {
    date = new Date(value);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-BD", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatStatus(value) {
  return String(value || "pending")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function isAdmin(user) {
  return Boolean(user && user.uid === ADMIN_UID);
}

function requireAdmin() {
  if (!isAdmin(auth.currentUser)) {
    throw new Error("Unauthorized. Please sign in with the admin account.");
  }
}

function getOrderItems(order) {
  if (Array.isArray(order.items)) return order.items;
  if (Array.isArray(order.cartItems)) return order.cartItems;
  if (Array.isArray(order.products)) return order.products;
  return [];
}

function getOrderSubtotal(order) {
  const subtotal = Number(
    order.subtotal ??
    order.total ??
    order.amount ??
    0
  );

  return Number.isFinite(subtotal) ? subtotal : 0;
}

function getDeliveryFee(order) {
  const fee = Number(order.deliveryFee ?? 0);
  return Number.isFinite(fee) ? fee : 0;
}

function getOrderTotal(order) {
  if (order.grandTotal != null) {
    const total = Number(order.grandTotal);
    if (Number.isFinite(total)) return total;
  }

  return getOrderSubtotal(order) + getDeliveryFee(order);
}

function getPaymentMethod(order) {
  return order.paymentMethod ||
    order.payment ||
    order.paymentType ||
    "Not specified";
}

function getPaymentStatus(order) {
  return String(order.paymentStatus || "unpaid").toLowerCase();
}

function getOrderStatus(order) {
  return String(order.status || "pending").toLowerCase();
}

function getCustomerName(order) {
  return order.customerName ||
    order.name ||
    order.fullName ||
    "Customer";
}

function getCustomerPhone(order) {
  return order.phone ||
    order.customerPhone ||
    order.mobile ||
    "—";
}

function getCustomerAddress(order) {
  return order.address ||
    order.deliveryAddress ||
    order.customerAddress ||
    "—";
}

function getTransactionId(order) {
  return order.transactionId ||
    order.txnId ||
    order.transactionID ||
    "";
}

function statusClass(status) {
  if (["paid", "delivered", "confirmed"].includes(status)) {
    return "success";
  }

  if (["pending", "processing", "shipped"].includes(status)) {
    return "warning";
  }

  if (["failed", "cancelled", "refunded"].includes(status)) {
    return "danger";
  }

  return "";
}

function makeOptions(options, current) {
  return options.map(value => `
    <option value="${safe(value)}"
      ${value === current ? "selected" : ""}>
      ${safe(formatStatus(value))}
    </option>
  `).join("");
}

function imageMarkup(url, name) {
  if (!url) {
    return `<div class="product-image"
      style="display:grid;place-items:center;font-size:22px">👜</div>`;
  }

  return `
    <img
      class="product-image"
      src="${safe(url)}"
      alt="${safe(name)}"
      loading="lazy"
      onerror="this.style.display='none'"
    >
  `;
}

/* =========================================
   LOGIN / LOGOUT
========================================= */

function showLogin() {
  $("loginScreen")?.classList.remove("hidden");
  $("adminApp")?.classList.add("hidden");
  $("dashboard")?.classList.add("hidden");
}

function showApp() {
  $("loginScreen")?.classList.add("hidden");
  $("adminApp")?.classList.remove("hidden");
  $("dashboard")?.classList.remove("hidden");
}

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("loginButton");
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    showMessage("Please enter your email and password.", true);
    return;
  }

  button.disabled = true;
  button.textContent = "Signing in…";
  showMessage("");

  try {
    const result = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (!isAdmin(result.user)) {
      await signOut(auth);
      showMessage(
        "Access denied. This account is not the authorized admin.",
        true
      );
      return;
    }

    showMessage("Login successful.");
  } catch (error) {
    console.error("Admin login error:", error);

    const messages = {
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/user-not-found": "Admin account was not found.",
      "auth/wrong-password": "Incorrect password.",
      "auth/too-many-requests": "Too many attempts. Try again later.",
      "auth/network-request-failed": "Network error. Check your internet."
    };

    showMessage(
      messages[error.code] || "Login failed: " + error.message,
      true
    );
  } finally {
    button.disabled = false;
    button.textContent = "Sign in to dashboard";
  }
});

$("logoutButton")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    alert("Could not log out. Please try again.");
  }
});

/* =========================================
   DASHBOARD MARKUP
========================================= */

function showDashboard() {
  requireAdmin();
  showApp();

  $("dashboard").innerHTML = `
    <section id="overview" class="section-anchor">

      <div class="page-heading">
        <div>
          <h1>Store Overview</h1>
          <p>
            Welcome to Minha Ladies Bag. Manage your
            inventory, orders and payments from here.
          </p>
        </div>

        <button id="refreshDashboard"
          class="btn btn-secondary" type="button">
          ↻ Refresh data
        </button>
      </div>

      <div class="stats-grid">

        <article class="stat-card">
          <div class="stat-top">
            <span class="stat-label">Total Products</span>
            <span class="stat-icon">👜</span>
          </div>
          <div class="stat-value" id="statProducts">—</div>
          <div class="stat-note">All products in your store</div>
        </article>

        <article class="stat-card">
          <div class="stat-top">
            <span class="stat-label">Active Products</span>
            <span class="stat-icon">✓</span>
          </div>
          <div class="stat-value" id="statActive">—</div>
          <div class="stat-note">Products marked active</div>
        </article>

        <article class="stat-card">
          <div class="stat-top">
            <span class="stat-label">Total Orders</span>
            <span class="stat-icon">▤</span>
          </div>
          <div class="stat-value" id="statOrders">—</div>
          <div class="stat-note">Orders currently recorded</div>
        </article>

        <article class="stat-card">
          <div class="stat-top">
            <span class="stat-label">Pending Orders</span>
            <span class="stat-icon">◷</span>
          </div>
          <div class="stat-value" id="statPending">—</div>
          <div class="stat-note">Orders awaiting action</div>
        </article>

      </div>

      <div class="stats-grid">

        <article class="stat-card">
          <div class="stat-top">
            <span class="stat-label">Paid Revenue</span>
            <span class="stat-icon">৳</span>
          </div>
          <div class="stat-value" id="statRevenue">৳0</div>
          <div class="stat-note">
            Total recorded value of orders marked paid
          </div>
        </article>

        <article class="stat-card">
          <div class="stat-top">
            <span class="stat-label">Delivered Orders</span>
            <span class="stat-icon">✓</span>
          </div>
          <div class="stat-value" id="statDelivered">—</div>
          <div class="stat-note">Orders marked delivered</div>
        </article>

      </div>

      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2>Order Status Overview</h2>
            <p class="panel-description">
              Distribution of orders by their current status.
            </p>
          </div>
        </div>

        <div class="chart-layout">

          <div class="chart-wrap">
            <canvas id="orderStatusChart"
              width="320" height="320"
              aria-label="Order status pie chart">
            </canvas>
          </div>

          <div id="chartLegend" class="chart-legend">
            <div class="empty-state">Loading chart…</div>
          </div>

        </div>
      </section>

    </section>

    <section id="products" class="section-anchor panel">

      <div class="panel-heading">
        <div>
          <h2>Product Management</h2>
          <p class="panel-description">
            Add new bags, update prices, manage stock and remove products.
          </p>
        </div>
      </div>

      <form id="productForm">

        <div class="field">
          <label for="productName">Product name *</label>
          <input id="productName" required
            maxlength="150" placeholder="e.g. Elegant Shoulder Bag">
        </div>

        <div class="field">
          <label for="productPrice">Price (BDT) *</label>
          <input id="productPrice" type="number"
            min="0" step="0.01" required placeholder="1200">
        </div>

        <div class="field">
          <label for="productStock">Stock quantity</label>
          <input id="productStock" type="number"
            min="0" step="1" value="0">
        </div>

        <div class="field">
          <label for="productCategory">Category</label>
          <input id="productCategory"
            maxlength="100" placeholder="Shoulder Bag">
        </div>

        <div class="field">
          <label for="productImage">Product image URL</label>
          <input id="productImage" type="url"
            placeholder="https://example.com/bag.jpg">
        </div>

        <div class="field">
          <label for="productDescription">Description</label>
          <textarea id="productDescription"
            maxlength="3000"
            placeholder="Product details..."></textarea>
        </div>

        <div class="field">
          <label for="productActive">Product visibility</label>
          <select id="productActive">
            <option value="true">Active — visible to customers</option>
            <option value="false">Inactive — hidden from customers</option>
          </select>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button id="saveProductButton" class="btn" type="submit">
            Save product
          </button>

          <button id="cancelEditButton"
            class="btn btn-secondary hidden" type="button">
            Cancel edit
          </button>
        </div>

        <p id="productMessage" class="status-message" aria-live="polite"></p>

      </form>

      <div style="height:1px;background:var(--border);margin:25px 0"></div>

      <div class="panel-heading">
        <div>
          <h2>Store Inventory</h2>
          <p class="panel-description">
            All products currently stored in Firestore.
          </p>
        </div>

        <button id="reloadProducts"
          class="btn btn-secondary" type="button">
          Refresh
        </button>
      </div>

      <div id="productsList">
        <div class="empty-state">Loading products…</div>
      </div>

    </section>

    <section id="orders" class="section-anchor panel">

      <div class="panel-heading">
        <div>
          <h2>Order Management</h2>
          <p class="panel-description">
            Update delivery, order status and manual payment verification.
          </p>
        </div>

        <button id="reloadOrders"
          class="btn btn-secondary" type="button">
          Refresh orders
        </button>
      </div>

      <div class="field">
        <label for="orderSearch">Search orders</label>
        <input id="orderSearch"
          placeholder="Order ID, customer name or phone">
      </div>

      <p class="panel-description">
        Delete is permanent. Review an order before confirming deletion.
      </p>

      <div id="ordersList">
        <div class="empty-state">Loading orders…</div>
      </div>

    </section>

    <section id="paymentSettings"
      class="section-anchor panel">

      <div class="panel-heading">
        <div>
          <h2>Payment Settings</h2>
          <p class="panel-description">
            Set the merchant numbers customers use for manual payments.
          </p>
        </div>
      </div>

      <form id="paymentSettingsForm">

        <div class="field">
          <label for="bkashNumber">bKash number</label>
          <input id="bkashNumber"
            type="tel" maxlength="30"
            placeholder="01XXXXXXXXX">
        </div>

        <div class="field">
          <label for="nagadNumber">Nagad number</label>
          <input id="nagadNumber"
            type="tel" maxlength="30"
            placeholder="01XXXXXXXXX">
        </div>

        <div class="field">
          <label for="rocketNumber">Rocket number</label>
          <input id="rocketNumber"
            type="tel" maxlength="30"
            placeholder="01XXXXXXXXX">
        </div>

        <button id="savePaymentSettings"
          class="btn" type="submit">
          Save payment settings
        </button>

        <p id="paymentSettingsMessage"
          class="status-message" aria-live="polite"></p>

      </form>

      <div style="margin-top:20px;padding:14px;border-radius:10px;background:var(--surface-soft);color:var(--muted);font-size:12px;line-height:1.8">
        Manual payment numbers are displayed for customer payment.
        Verify each transaction independently before marking it paid.
      </div>

    </section>

    <footer style="padding:10px 0 25px;color:var(--muted);font-size:11px;text-align:center">
      Minha Ladies Bag · Store Administration
    </footer>
  `;

  $("refreshDashboard").addEventListener("click", refreshAll);
  $("reloadProducts").addEventListener("click", loadProducts);
  $("reloadOrders").addEventListener("click", loadOrders);

  $("productForm").addEventListener("submit", saveProduct);
  $("cancelEditButton").addEventListener("click", resetProductForm);

  $("ordersList").addEventListener("click", handleOrderAction);
  $("ordersList").addEventListener("change", handleOrderChange);
  $("productsList").addEventListener("click", handleProductAction);

  $("orderSearch").addEventListener("input", renderOrders);

  $("paymentSettingsForm").addEventListener(
    "submit",
    savePaymentSettings
  );

  document.querySelectorAll(".nav-link, .mobile-nav a").forEach(link => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach(item => {
        item.classList.toggle("active", item.getAttribute("href") === link.getAttribute("href"));
      });
    });
  });

  refreshAll();
}

/* =========================================
   LOAD DATA
========================================= */

async function refreshAll() {
  requireAdmin();

  await Promise.all([
    loadProducts(),
    loadOrders(),
    loadPaymentSettings()
  ]);

  renderStats();
  drawOrderChart();
}

async function loadProducts() {
  requireAdmin();

  const container = $("productsList");
  if (container) container.innerHTML =
    `<div class="empty-state">Loading products…</div>`;

  try {
    const snapshot = await getDocs(collection(db, "products"));

    productsCache = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderProducts();
    renderStats();
  } catch (error) {
    console.error("Products load error:", error);

    if (container) {
      container.innerHTML =
        `<div class="empty-state">Could not load products. Check Firestore access and connection.</div>`;
    }
  }
}

async function loadOrders() {
  requireAdmin();

  const container = $("ordersList");
  if (container) container.innerHTML =
    `<div class="empty-state">Loading orders…</div>`;

  try {
    const snapshot = await getDocs(collection(db, "orders"));

    ordersCache = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderOrders();
    renderStats();
    drawOrderChart();
  } catch (error) {
    console.error("Orders load error:", error);

    if (container) {
      container.innerHTML =
        `<div class="empty-state">Could not load orders. Check Firestore access and connection.</div>`;
    }
  }
}

/* =========================================
   DASHBOARD STATISTICS
========================================= */

function renderStats() {
  const totalProducts = productsCache.length;

  const activeProducts = productsCache.filter(product =>
    product.active !== false
  ).length;

  const pendingOrders = ordersCache.filter(order =>
    ["pending", "confirmed", "processing"].includes(getOrderStatus(order))
  ).length;

  const deliveredOrders = ordersCache.filter(order =>
    getOrderStatus(order) === "delivered"
  ).length;

  const paidRevenue = ordersCache
    .filter(order => getPaymentStatus(order) === "paid")
    .reduce((sum, order) => sum + getOrderTotal(order), 0);

  if ($("statProducts")) $("statProducts").textContent = totalProducts;
  if ($("statActive")) $("statActive").textContent = activeProducts;
  if ($("statOrders")) $("statOrders").textContent = ordersCache.length;
  if ($("statPending")) $("statPending").textContent = pendingOrders;
  if ($("statDelivered")) $("statDelivered").textContent = deliveredOrders;
  if ($("statRevenue")) $("statRevenue").textContent = money(paidRevenue);
}

/* =========================================
   ORDER STATUS PIE CHART
========================================= */

function drawOrderChart() {
  const canvas = $("orderStatusChart");
  const legend = $("chartLegend");

  if (!canvas || !legend) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const counts = {};

  ORDER_STATUSES.forEach(status => {
    counts[status] = ordersCache.filter(order =>
      getOrderStatus(order) === status
    ).length;
  });

  const total = ordersCache.length;

  const entries = ORDER_STATUSES.map(status => ({
    status,
    count: counts[status],
    color: STATUS_COLORS[status]
  }));

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 112;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#eee6dd";
    ctx.lineWidth = 29;
    ctx.stroke();
  } else {
    let angle = -Math.PI / 2;

    entries.forEach(entry => {
      if (entry.count === 0) return;

      const slice = (entry.count / total) * Math.PI * 2;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, angle, angle + slice);
      ctx.closePath();

      ctx.fillStyle = entry.color;
      ctx.fill();

      angle += slice;
    });

    // White centre creates a doughnut-style pie chart.
    ctx.beginPath();
    ctx.arc(centerX, centerY, 76, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#302821";
  ctx.font = "bold 35px Arial";
  ctx.fillText(String(total), centerX, centerY - 8);

  ctx.fillStyle = "#81766d";
  ctx.font = "12px Arial";
  ctx.fillText("Total orders", centerX, centerY + 20);

  legend.innerHTML = total === 0
    ? `<div class="empty-state">No orders yet. The chart will update when orders are recorded.</div>`
    : entries.map(entry => `
      <div class="legend-item">
        <span class="legend-name">
          <span class="legend-dot"
            style="background:${entry.color}"></span>
          ${safe(formatStatus(entry.status))}
        </span>

        <strong>${entry.count}</strong>
      </div>
    `).join("");
}

/* =========================================
   PRODUCT MANAGEMENT
========================================= */

function renderProducts() {
  const container = $("productsList");
  if (!container) return;

  if (!productsCache.length) {
    container.innerHTML = `
      <div class="empty-state">
        No products found. Add your first product using the form above.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Image</th>
            <th>Product</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          ${productsCache.map(product => `
            <tr>
              <td>${imageMarkup(product.imageUrl, product.name)}</td>

              <td>
                <strong>${safe(product.name || "Unnamed product")}</strong>
                <div class="muted">${safe(product.category || "")}</div>
              </td>

              <td>${money(product.price)}</td>

              <td>${Number(product.stock ?? 0)}</td>

              <td>
                <span class="status-badge ${product.active === false ? "danger" : "success"}">
                  ${product.active === false ? "Inactive" : "Active"}
                </span>
              </td>

              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-secondary"
                    data-product-action="edit"
                    data-id="${safe(product.id)}"
                    type="button">
                    Edit
                  </button>

                  <button class="btn btn-danger"
                    data-product-action="delete"
                    data-id="${safe(product.id)}"
                    type="button">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function saveProduct(event) {
  event.preventDefault();
  requireAdmin();

  const button = $("saveProductButton");
  const message = $("productMessage");

  const name = $("productName").value.trim();
  const price = Number($("productPrice").value);
  const stock = Number($("productStock").value || 0);

  if (!name || !Number.isFinite(price) || price < 0) {
    message.textContent = "Enter a valid product name and price.";
    message.style.color = "#c0392b";
    return;
  }

  if (!Number.isFinite(stock) || stock < 0) {
    message.textContent = "Enter a valid stock quantity.";
    message.style.color = "#c0392b";
    return;
  }

  const imageUrl = $("productImage").value.trim();

  if (imageUrl) {
    try {
      const parsedUrl = new URL(imageUrl);

      if (!["https:", "http:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      message.textContent = "Enter a valid image URL.";
      message.style.color = "#c0392b";
      return;
    }
  }

  const data = {
    name,
    price,
    stock,
    category: $("productCategory").value.trim(),
    imageUrl,
    description: $("productDescription").value.trim(),
    active: $("productActive").value === "true",
    updatedAt: serverTimestamp()
  };

  button.disabled = true;
  button.textContent = "Saving…";
  message.textContent = "";

  try {
    if (editingProductId) {
      await updateDoc(
        doc(db, "products", editingProductId),
        data
      );
    } else {
      data.createdAt = serverTimestamp();

      await addDoc(collection(db, "products"), data);
    }

    message.textContent = editingProductId
      ? "Product updated successfully."
      : "Product added successfully.";

    message.style.color = "#27734a";

    resetProductForm();
    await loadProducts();
  } catch (error) {
    console.error("Product save error:", error);

    message.textContent =
      "Could not save product: " + error.message;

    message.style.color = "#c0392b";
  } finally {
    button.disabled = false;
    button.textContent = editingProductId
      ? "Update product"
      : "Save product";
  }
}

function resetProductForm() {
  editingProductId = null;

  $("productForm")?.reset();

  if ($("productStock")) $("productStock").value = "0";
  if ($("productActive")) $("productActive").value = "true";

  if ($("saveProductButton")) {
    $("saveProductButton").textContent = "Save product";
  }

  $("cancelEditButton")?.classList.add("hidden");
}

function handleProductAction(event) {
  const button = event.target.closest("[data-product-action]");
  if (!button) return;

  requireAdmin();

  const id = button.dataset.id;
  const action = button.dataset.productAction;

  const product = productsCache.find(item => item.id === id);
  if (!product) return;

  if (action === "edit") {
    editingProductId = id;

    $("productName").value = product.name || "";
    $("productPrice").value = product.price ?? "";
    $("productStock").value = product.stock ?? 0;
    $("productCategory").value = product.category || "";
    $("productImage").value = product.imageUrl || "";
    $("productDescription").value = product.description || "";
    $("productActive").value = product.active === false ? "false" : "true";

    $("saveProductButton").textContent = "Update product";
    $("cancelEditButton").classList.remove("hidden");

    $("products").scrollIntoView({ behavior: "smooth" });
    $("productName").focus();

    return;
  }

  if (action === "delete") {
    const confirmed = confirm(
      `Permanently delete "${product.name || "this product"}"?\n\n` +
      "This action cannot be undone."
    );

    if (!confirmed) return;

    deleteProduct(id);
  }
}

async function deleteProduct(id) {
  requireAdmin();

  try {
    await deleteDoc(doc(db, "products", id));

    alert("Product deleted successfully.");

    await loadProducts();
  } catch (error) {
    console.error("Product delete error:", error);
    alert("Could not delete product: " + error.message);
  }
}

/* =========================================
   ORDER MANAGEMENT
========================================= */

function renderOrders() {
  const container = $("ordersList");
  if (!container) return;

  const search = ($("orderSearch")?.value || "")
    .trim()
    .toLowerCase();

  const filtered = ordersCache.filter(order => {
    const searchable = [
      order.id,
      getCustomerName(order),
      getCustomerPhone(order),
      getOrderStatus(order),
      getPaymentStatus(order)
    ].join(" ").toLowerCase();

    return searchable.includes(search);
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        ${ordersCache.length
          ? "No orders match your search."
          : "No orders have been recorded yet."}
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(order => {
    const items = getOrderItems(order);
    const status = getOrderStatus(order);
    const paymentStatus = getPaymentStatus(order);
    const transactionId = getTransactionId(order);

    const itemMarkup = items.length
      ? items.map(item => {
          const name = item.name || item.productName || "Product";
          const quantity = Number(item.quantity ?? item.qty ?? 1);
          const price = Number(item.price ?? item.unitPrice ?? 0);

          return `
            <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border)">
              <span>${safe(name)} × ${quantity}</span>
              <strong>${money(price * quantity)}</strong>
            </div>
          `;
        }).join("")
      : `<p class="muted">No item details available in this order.</p>`;

    return `
      <article class="panel"
        style="margin:0 0 17px;padding:17px;box-shadow:none;background:#fffdfb">

        <div class="panel-heading">
          <div style="min-width:0">
            <div style="font-weight:800;overflow-wrap:anywhere">
              Order #${safe(order.id)}
            </div>

            <div class="panel-description">
              ${safe(formatDate(order.createdAt || order.orderDate || order.date))}
            </div>
          </div>

          <div style="display:flex;gap:7px;flex-wrap:wrap">
            <span class="status-badge ${statusClass(status)}">
              ${safe(formatStatus(status))}
            </span>

            <span class="status-badge ${statusClass(paymentStatus)}">
              ${safe(formatStatus(paymentStatus))}
            </span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px">

          <div>
            <h3 style="margin:0 0 10px;font-size:13px">Customer details</h3>

            <p style="margin:5px 0">
              <strong>Name:</strong> ${safe(getCustomerName(order))}
            </p>

            <p style="margin:5px 0">
              <strong>Phone:</strong> ${safe(getCustomerPhone(order))}
            </p>

            <p style="margin:5px 0">
              <strong>Address:</strong> ${safe(getCustomerAddress(order))}
            </p>
          </div>

          <div>
            <h3 style="margin:0 0 10px;font-size:13px">Order items</h3>
            ${itemMarkup}
          </div>

        </div>

        <div style="margin-top:16px;padding:13px;border-radius:10px;background:var(--surface-soft)">

          <div style="display:flex;justify-content:space-between;gap:12px;margin:5px 0">
            <span>Subtotal</span>
            <strong>${money(getOrderSubtotal(order))}</strong>
          </div>

          <div style="display:flex;justify-content:space-between;gap:12px;margin:5px 0">
            <span>Delivery fee</span>
            <strong>${money(getDeliveryFee(order))}</strong>
          </div>

          <div style="display:flex;justify-content:space-between;gap:12px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:16px">
            <strong>Order total</strong>
            <strong>${money(getOrderTotal(order))}</strong>
          </div>

        </div>

        <div style="margin-top:17px">

          <div class="field">
            <label for="status-${safe(order.id)}">Order status</label>
            <select id="status-${safe(order.id)}"
              data-order-field="status"
              data-id="${safe(order.id)}">
              ${makeOptions(ORDER_STATUSES, status)}
            </select>
          </div>

          <div class="field">
            <label for="payment-${safe(order.id)}">Payment status</label>
            <select id="payment-${safe(order.id)}"
              data-order-field="paymentStatus"
              data-id="${safe(order.id)}">
              ${makeOptions(PAYMENT_STATUSES, paymentStatus)}
            </select>
          </div>

          <div class="field">
            <label for="fee-${safe(order.id)}">Delivery fee (BDT)</label>
            <input id="fee-${safe(order.id)}"
              data-order-field="deliveryFee"
              data-id="${safe(order.id)}"
              type="number" min="0" step="0.01"
              value="${getDeliveryFee(order)}">
          </div>

          <div class="field">
            <label for="courier-${safe(order.id)}">Delivery service / courier</label>
            <input id="courier-${safe(order.id)}"
              data-order-field="courierName"
              data-id="${safe(order.id)}"
              value="${safe(order.courierName || order.deliveryService || "")}"
              placeholder="e.g. Steadfast, Pathao">
          </div>

          <div class="field">
            <label for="tracking-${safe(order.id)}">Tracking number</label>
            <input id="tracking-${safe(order.id)}"
              data-order-field="trackingNumber"
              data-id="${safe(order.id)}"
              value="${safe(order.trackingNumber || "")}"
              placeholder="Optional tracking number">
          </div>

        </div>

        <div style="margin-top:13px;padding:13px;border:1px solid var(--border);border-radius:10px">

          <strong style="display:block;margin-bottom:9px">
            Manual payment details
          </strong>

          <p style="margin:5px 0">
            <strong>Method:</strong>
            ${safe(getPaymentMethod(order))}
          </p>

          <p style="margin:5px 0">
            <strong>Transaction ID:</strong>
            ${transactionId
              ? `<code style="overflow-wrap:anywhere">${safe(transactionId)}</code>`
              : "Not provided"}
          </p>

          <p class="panel-description">
            Confirm a manual payment only after independently verifying the transaction.
          </p>

        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:17px">

          <button class="btn"
            data-order-action="save"
            data-id="${safe(order.id)}"
            type="button">
            Save order changes
          </button>

          <button class="btn btn-danger"
            data-order-action="delete"
            data-id="${safe(order.id)}"
            type="button">
            Delete order
          </button>

        </div>

      </article>
    `;
  }).join("");
}

async function handleOrderChange(event) {
  const field = event.target.dataset.orderField;

  if (!field) return;

  requireAdmin();

  const id = event.target.dataset.id;
  const order = ordersCache.find(item => item.id === id);

  if (!order) return;

  // A status selection is saved with the order's Save button.
  // No database write occurs just by changing a field.
}

async function handleOrderAction(event) {
  const button = event.target.closest("[data-order-action]");
  if (!button) return;

  requireAdmin();

  const id = button.dataset.id;
  const action = button.dataset.orderAction;

  const order = ordersCache.find(item => item.id === id);
  if (!order) return;

  if (action === "delete") {
    const confirmed = confirm(
      `Permanently delete order #${id}?\n\n` +
      `Customer: ${getCustomerName(order)}\n` +
      `Total: ${money(getOrderTotal(order))}\n\n` +
      "This cannot be undone. Continue?"
    );

    if (!confirmed) return;

    await deleteOrder(id);
    return;
  }

  if (action === "save") {
    await saveOrderChanges(id, button);
  }
}

async function saveOrderChanges(id, button) {
  requireAdmin();

  const order = ordersCache.find(item => item.id === id);
  if (!order) return;

  const status = $(`status-${id}`).value;
  const paymentStatus = $(`payment-${id}`).value;
  const deliveryFee = Number($(`fee-${id}`).value);
  const courierName = $(`courier-${id}`).value.trim();
  const trackingNumber = $(`tracking-${id}`).value.trim();

  if (!ORDER_STATUSES.includes(status)) {
    alert("Invalid order status.");
    return;
  }

  if (!PAYMENT_STATUSES.includes(paymentStatus)) {
    alert("Invalid payment status.");
    return;
  }

  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
    alert("Enter a valid delivery fee.");
    return;
  }

  const updates = {
    status,
    paymentStatus,
    deliveryFee,
    grandTotal: getOrderSubtotal(order) + deliveryFee,
    courierName,
    trackingNumber,
    updatedAt: serverTimestamp()
  };

  if (status === "confirmed" && !order.confirmedAt) {
    updates.confirmedAt = serverTimestamp();
    updates.paymentDeadline = new Date(
      Date.now() + PAYMENT_WINDOW_MS
    );
  }

  if (status === "delivered" && !order.deliveredAt) {
    updates.deliveredAt = serverTimestamp();
  }

  if (status === "cancelled" && !order.cancelledAt) {
    updates.cancelledAt = serverTimestamp();
  }

  if (paymentStatus === "paid" && !order.paidAt) {
    const confirmed = confirm(
      "Have you independently verified that the payment was received?\n\n" +
      "Only select OK if the transaction has been verified."
    );

    if (!confirmed) {
      $(`payment-${id}`).value = getPaymentStatus(order);
      return;
    }

    updates.paidAt = serverTimestamp();
  }

  if (paymentStatus !== "paid" && order.paidAt) {
    updates.paidAt = null;
  }

  button.disabled = true;
  button.textContent = "Saving…";

  try {
    await updateDoc(doc(db, "orders", id), updates);

    alert("Order updated successfully.");

    await loadOrders();
  } catch (error) {
    console.error("Order update error:", error);
    alert("Could not update order: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Save order changes";
  }
}

async function deleteOrder(id) {
  requireAdmin();

  try {
    await deleteDoc(doc(db, "orders", id));

    alert("Order deleted permanently.");

    await loadOrders();
  } catch (error) {
    console.error("Order delete error:", error);

    alert(
      "Could not delete order. Check Firestore permissions and try again.\n\n" +
      error.message
    );
  }
}

/* =========================================
   PAYMENT SETTINGS
========================================= */

async function loadPaymentSettings() {
  requireAdmin();

  try {
    const ref = doc(db, "settings", "payment");
    const snapshot = await getDoc(ref);

    paymentSettings = snapshot.exists()
      ? snapshot.data()
      : {};

    if ($("bkashNumber")) {
      $("bkashNumber").value = paymentSettings.bkashNumber || "";
    }

    if ($("nagadNumber")) {
      $("nagadNumber").value = paymentSettings.nagadNumber || "";
    }

    if ($("rocketNumber")) {
      $("rocketNumber").value = paymentSettings.rocketNumber || "";
    }
  } catch (error) {
    console.error("Payment settings load error:", error);

    if ($("paymentSettingsMessage")) {
      $("paymentSettingsMessage").textContent =
        "Could not load payment settings: " + error.message;

      $("paymentSettingsMessage").style.color = "#c0392b";
    }
  }
}

async function savePaymentSettings(event) {
  event.preventDefault();
  requireAdmin();

  const button = $("savePaymentSettings");
  const message = $("paymentSettingsMessage");

  const settings = {
    bkashNumber: $("bkashNumber").value.trim(),
    nagadNumber: $("nagadNumber").value.trim(),
    rocketNumber: $("rocketNumber").value.trim(),
    updatedAt: serverTimestamp()
  };

  button.disabled = true;
  button.textContent = "Saving…";
  message.textContent = "";

  try {
    await setDoc(
      doc(db, "settings", "payment"),
      settings,
      { merge: true }
    );

    paymentSettings = {
      ...paymentSettings,
      ...settings
    };

    message.textContent = "Payment settings saved successfully.";
    message.style.color = "#27734a";
  } catch (error) {
    console.error("Payment settings save error:", error);

    message.textContent =
      "Could not save settings: " + error.message;

    message.style.color = "#c0392b";
  } finally {
    button.disabled = false;
    button.textContent = "Save payment settings";
  }
}

/* =========================================
   AUTH STATE
========================================= */

onAuthStateChanged(auth, async user => {
  if (!user) {
    showLogin();
    return;
  }

  if (!isAdmin(user)) {
    showMessage(
      "Access denied. This account is not authorized.",
      true
    );

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Unauthorized sign-out error:", error);
    }

    showLogin();
    return;
  }

  try {
    showDashboard();
  } catch (error) {
    console.error("Dashboard initialization error:", error);
    showMessage("Could not open dashboard: " + error.message, true);
  }
});