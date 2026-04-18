/**
 * ============================================
 * МОЙ ВИШЛИСТ — Firebase Edition
 * ============================================
 *
 * Авторизация: Firebase Authentication (Email/Password)
 * Хранение:    Firebase Firestore
 * Тема:        VS Code Dark
 */

// ============================================
// 1. FIREBASE IMPORTS (CDN — Modular SDK v9+)
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// 2. FIREBASE CONFIGURATION
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyCZ4qwPCmBiNmLfD6ZSP4tTK8LK4t0xGNQ",
    authDomain: "wishlist-5f47b.firebaseapp.com",
    projectId: "wishlist-5f47b",
    storageBucket: "wishlist-5f47b.firebasestorage.app",
    messagingSenderId: "24490779725",
    appId: "1:24490779725:web:40b4dcb60dbcaee99fe804"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ============================================
// 3. STATE
// ============================================

const State = {
    user: null,            // Текущий пользователь (Firebase User)
    categories: [],        // Категории текущего пользователя
    currentCategory: null, // ID открытой категории
    unsubscribe: null,     // Отписка от snapshot
};

// Начальные категории по умолчанию
const DEFAULT_CATEGORIES = [
    { id: genId(), name: "Спорт", subgroups: [] },
    { id: genId(), name: "Повседневное", subgroups: [] },
    { id: genId(), name: "Техника", subgroups: [] }
];

// ============================================
// 4. UTILITIES
// ============================================

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtPrice(n) {
    return new Intl.NumberFormat("ru-RU").format(n || 0) + " ₽";
}

function escHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

// ============================================
// 5. FIRESTORE OPERATIONS
// ============================================

/**
 * Получить ссылку на документ пользователя
 */
function userDocRef() {
    if (!State.user) return null;
    return doc(db, "users", State.user.uid);
}

/**
 * Загрузить данные пользователя из Firestore.
 * Если документа нет — создаёт его с категориями по умолчанию.
 */
async function loadUserData() {
    const ref = userDocRef();
    if (!ref) return;

    const snap = await getDoc(ref);
    if (snap.exists()) {
        const data = snap.data();
        State.categories = data.categories || [];
    } else {
        // Первый вход — создаём документ с дефолтными категориями
        State.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        await setDoc(ref, {
            email: State.user.email,
            categories: State.categories,
            createdAt: new Date().toISOString()
        });
    }
}

/**
 * Сохранить категории в Firestore
 */
async function saveCategories() {
    const ref = userDocRef();
    if (!ref) return;
    await updateDoc(ref, { categories: State.categories });
}

/**
 * Подписаться на изменения данных в реальном времени
 */
function subscribeToUserData() {
    // Отписываемся от предыдущего слушателя
    if (State.unsubscribe) {
        State.unsubscribe();
        State.unsubscribe = null;
    }

    const ref = userDocRef();
    if (!ref) return;

    State.unsubscribe = onSnapshot(ref, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            State.categories = data.categories || [];
            refreshUI();
        }
    });
}

// ============================================
// 6. AUTH OPERATIONS
// ============================================

async function login(email, password) {
    return await signInWithEmailAndPassword(auth, email, password);
}

async function register(email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred;
}

async function logout() {
    if (State.unsubscribe) {
        State.unsubscribe();
        State.unsubscribe = null;
    }
    await signOut(auth);
}

// ============================================
// 7. DATA HELPERS (Categories / Subgroups / Items)
// ============================================

function findCat(id) {
    return State.categories.find(c => c.id === id) || null;
}

function findSg(catId, sgId) {
    const cat = findCat(catId);
    if (!cat) return null;
    return cat.subgroups.find(s => s.id === sgId) || null;
}

function calcSgTotal(sg) {
    return sg.items.reduce((s, it) => s + (parseFloat(it.price) || 0), 0);
}

function calcCatTotal(cat) {
    return cat.subgroups.reduce((s, sg) => s + calcSgTotal(sg), 0);
}

// ============================================
// 8. CRUD — Categories
// ============================================

function createCategory(name) {
    State.categories.push({
        id: genId(),
        name: name.trim(),
        subgroups: []
    });
    return saveCategories();
}

function updateCategory(id, name) {
    const cat = findCat(id);
    if (cat) { cat.name = name.trim(); return saveCategories(); }
}

function deleteCategory(id) {
    State.categories = State.categories.filter(c => c.id !== id);
    return saveCategories();
}

// ============================================
// 9. CRUD — Subgroups
// ============================================

function createSubgroup(catId, name) {
    const cat = findCat(catId);
    if (!cat) return;
    cat.subgroups.push({ id: genId(), name: name.trim(), items: [] });
    return saveCategories();
}

function updateSubgroup(catId, sgId, name) {
    const sg = findSg(catId, sgId);
    if (sg) { sg.name = name.trim(); return saveCategories(); }
}

function deleteSubgroup(catId, sgId, deleteItems = false) {
    const cat = findCat(catId);
    if (!cat) return;

    const idx = cat.subgroups.findIndex(s => s.id === sgId);
    if (idx === -1) return;

    const sg = cat.subgroups[idx];

    if (sg.items.length > 0 && !deleteItems) {
        // Переносим в "Общее"
        let general = cat.subgroups.find(s => s.name === "Общее");
        if (!general) {
            general = { id: genId(), name: "Общее", items: [] };
            cat.subgroups.push(general);
        }
        general.items.push(...sg.items);
    }

    cat.subgroups.splice(idx, 1);
    return saveCategories();
}

// ============================================
// 10. CRUD — Items
// ============================================

function createItem(catId, sgId, name, price) {
    const cat = findCat(catId);
    if (!cat) return;

    let sg = sgId ? findSg(catId, sgId) : null;

    if (!sg) {
        sg = cat.subgroups.find(s => s.name === "Общее");
        if (!sg) {
            sg = { id: genId(), name: "Общее", items: [] };
            cat.subgroups.push(sg);
        }
    }

    sg.items.push({
        id: genId(),
        name: name.trim(),
        price: Math.max(0, parseFloat(price) || 0)
    });
    return saveCategories();
}

function updateItem(catId, sgId, itemId, name, price) {
    const sg = findSg(catId, sgId);
    if (!sg) return;
    const it = sg.items.find(i => i.id === itemId);
    if (it) {
        it.name = name.trim();
        it.price = Math.max(0, parseFloat(price) || 0);
        return saveCategories();
    }
}

function deleteItem(catId, sgId, itemId) {
    const sg = findSg(catId, sgId);
    if (!sg) return;
    sg.items = sg.items.filter(i => i.id !== itemId);
    return saveCategories();
}

// ============================================
// 11. UI — Notifications
// ============================================

function notify(msg, type = "success") {
    const el = $("#notification");
    el.textContent = msg;
    el.className = `notification ${type}`;
    el.offsetHeight; // reflow
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3000);
}

// ============================================
// 12. UI — Modals
// ============================================

function openModal(id) {
    $(`#${id}`).classList.add("active");
    const inp = $(`#${id} input:not([type="hidden"])`);
    if (inp) setTimeout(() => inp.focus(), 100);
}

function closeModal(id) {
    $(`#${id}`).classList.remove("active");
    const form = $(`#${id} form`);
    if (form) form.reset();
}

function closeAllModals() {
    $$(".modal.active").forEach(m => m.classList.remove("active"));
}

// ============================================
// 13. UI — Rendering
// ============================================

function renderCategories() {
    const box = $("#categoriesList");
    box.innerHTML = "";

    if (!State.user) {
        box.innerHTML = `<div class="empty-state">Войдите, чтобы увидеть вишлист</div>`;
        return;
    }

    if (State.categories.length === 0) {
        box.innerHTML = `<div class="empty-state">Нет категорий. Создайте первую!</div>`;
        return;
    }

    State.categories.forEach(cat => {
        const total = calcCatTotal(cat);
        const card = document.createElement("div");
        card.className = "category-card";
        card.innerHTML = `
            <div class="category-info-main">
                <div class="category-name">${escHtml(cat.name)}</div>
                <div class="category-sum">${fmtPrice(total)}</div>
            </div>
            <div class="category-actions-icons">
                <button class="icon-btn edit" title="Редактировать">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="icon-btn delete" title="Удалить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;

        card.addEventListener("click", e => {
            if (!e.target.closest(".icon-btn")) navigateToCategory(cat.id);
        });

        card.querySelector(".edit").addEventListener("click", e => {
            e.stopPropagation();
            openEditCategoryModal(cat.id);
        });
        card.querySelector(".delete").addEventListener("click", e => {
            e.stopPropagation();
            confirmDeleteCategory(cat.id);
        });

        box.appendChild(card);
    });
}

function renderCategoryPage() {
    const cat = findCat(State.currentCategory);
    if (!cat) return navigateToHome();

    $("#categoryTitle").textContent = cat.name;
    $("#categoryTotal").textContent = "Общая сумма: " + fmtPrice(calcCatTotal(cat));

    const box = $("#subgroupsList");
    box.innerHTML = "";

    if (cat.subgroups.length === 0) {
        box.innerHTML = `<div class="empty-state">Нет подгрупп. Создайте первую!</div>`;
        return;
    }

    cat.subgroups.forEach(sg => {
        const el = document.createElement("div");
        el.className = "subgroup expanded";
        el.dataset.id = sg.id;

        el.innerHTML = `
            <div class="subgroup-header">
                <div class="subgroup-title-wrapper">
                    <span class="subgroup-toggle">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </span>
                    <span class="subgroup-name">${escHtml(sg.name)}</span>
                </div>
                <div style="display:flex;align-items:center;">
                    <span class="subgroup-sum">${fmtPrice(calcSgTotal(sg))}</span>
                    <div class="subgroup-actions">
                        <button class="icon-btn edit-sg" title="Редактировать">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="icon-btn delete-sg" title="Удалить">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="subgroup-content">
                <div class="items-list">
                    ${sg.items.length === 0
                        ? `<div class="empty-state">Нет вещей</div>`
                        : sg.items.map(it => `
                            <div class="item" data-item-id="${it.id}">
                                <div class="item-info">
                                    <div class="item-name">${escHtml(it.name)}</div>
                                </div>
                                <span class="item-price">${fmtPrice(it.price)}</span>
                                <div class="item-actions">
                                    <button class="icon-btn edit-item" title="Редактировать">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                    </button>
                                    <button class="icon-btn delete-item" title="Удалить">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        `).join("")
                    }
                </div>
                <button class="action-btn secondary add-item-to-subgroup" style="margin-top:12px;width:100%;justify-content:center;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Добавить вещь
                </button>
            </div>
        `;

        // Toggle
        el.querySelector(".subgroup-header").addEventListener("click", e => {
            if (!e.target.closest(".icon-btn")) el.classList.toggle("expanded");
        });

        // Subgroup actions
        el.querySelector(".edit-sg").addEventListener("click", e => {
            e.stopPropagation();
            openEditSubgroupModal(sg.id);
        });
        el.querySelector(".delete-sg").addEventListener("click", e => {
            e.stopPropagation();
            confirmDeleteSubgroup(sg.id);
        });

        // Item actions
        el.querySelectorAll(".edit-item").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                const id = btn.closest(".item").dataset.itemId;
                openEditItemModal(id, sg.id);
            });
        });
        el.querySelectorAll(".delete-item").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                const id = btn.closest(".item").dataset.itemId;
                confirmDeleteItem(id, sg.id);
            });
        });

        // Add item to subgroup
        el.querySelector(".add-item-to-subgroup").addEventListener("click", e => {
            e.stopPropagation();
            openAddItemModal(sg.id);
        });

        box.appendChild(el);
    });
}

function refreshUI() {
    updateUserDisplay();
    const homePage = $("#homePage");
    if (homePage.classList.contains("active")) {
        renderCategories();
    } else if ($("#categoryPage").classList.contains("active")) {
        renderCategoryPage();
    }
}

function updateUserDisplay() {
    const el = $("#currentUser");
    if (State.user) {
        const name = State.user.displayName || State.user.email;
        el.textContent = name;
        el.classList.add("authenticated");
    } else {
        el.textContent = "Не авторизован";
        el.classList.remove("authenticated");
    }
}

// ============================================
// 14. NAVIGATION
// ============================================

function navigateToHome() {
    $$(".page").forEach(p => p.classList.remove("active"));
    $("#homePage").classList.add("active");
    State.currentCategory = null;
    renderCategories();
}

function navigateToCategory(id) {
    State.currentCategory = id;
    $$(".page").forEach(p => p.classList.remove("active"));
    $("#categoryPage").classList.add("active");
    renderCategoryPage();
}

// ============================================
// 15. MODAL HELPERS
// ============================================

let pendingDeleteSgId = null;

function openEditCategoryModal(id) {
    const cat = findCat(id);
    if (!cat) return;
    $("#categoryModalTitle").textContent = "Редактировать категорию";
    $("#categoryId").value = id;
    $("#categoryNameInput").value = cat.name;
    openModal("categoryModal");
}

function openAddCategoryModal() {
    $("#categoryModalTitle").textContent = "Новая категория";
    $("#categoryId").value = "";
    $("#categoryNameInput").value = "";
    openModal("categoryModal");
}

function confirmDeleteCategory(id) {
    const cat = findCat(id);
    if (!cat) return;
    $("#confirmMessage").textContent = `Удалить категорию "${cat.name}"?`;
    $("#confirmBtn").onclick = async () => {
        await deleteCategory(id);
        closeModal("confirmModal");
        renderCategories();
        notify("Категория удалена");
    };
    openModal("confirmModal");
}

function openEditSubgroupModal(sgId) {
    const sg = findSg(State.currentCategory, sgId);
    if (!sg) return;
    $("#subgroupModalTitle").textContent = "Редактировать подгруппу";
    $("#subgroupId").value = sgId;
    $("#subgroupNameInput").value = sg.name;
    openModal("subgroupModal");
}

function openAddSubgroupModal() {
    $("#subgroupModalTitle").textContent = "Новая подгруппа";
    $("#subgroupId").value = "";
    $("#subgroupNameInput").value = "";
    openModal("subgroupModal");
}

function confirmDeleteSubgroup(sgId) {
    const sg = findSg(State.currentCategory, sgId);
    if (!sg) return;
    pendingDeleteSgId = sgId;

    if (sg.items.length > 0) {
        openModal("deleteSubgroupModal");
    } else {
        $("#confirmMessage").textContent = `Удалить подгруппу "${sg.name}"?`;
        $("#confirmBtn").onclick = async () => {
            await deleteSubgroup(State.currentCategory, sgId, true);
            closeModal("confirmModal");
            renderCategoryPage();
            notify("Подгруппа удалена");
        };
        openModal("confirmModal");
    }
}

function openEditItemModal(itemId, sgId) {
    const sg = findSg(State.currentCategory, sgId);
    const it = sg?.items.find(i => i.id === itemId);
    if (!it) return;
    $("#itemModalTitle").textContent = "Редактировать вещь";
    $("#itemId").value = itemId;
    $("#itemSubgroupId").value = sgId;
    $("#itemNameInput").value = it.name;
    $("#itemPriceInput").value = it.price;
    openModal("itemModal");
}

function openAddItemModal(sgId = null) {
    $("#itemModalTitle").textContent = "Новая вещь";
    $("#itemId").value = "";
    $("#itemSubgroupId").value = sgId || "";
    $("#itemNameInput").value = "";
    $("#itemPriceInput").value = "";
    openModal("itemModal");
}

function confirmDeleteItem(itemId, sgId) {
    const sg = findSg(State.currentCategory, sgId);
    const it = sg?.items.find(i => i.id === itemId);
    if (!it) return;
    $("#confirmMessage").textContent = `Удалить вещь "${it.name}"?`;
    $("#confirmBtn").onclick = async () => {
        await deleteItem(State.currentCategory, sgId, itemId);
        closeModal("confirmModal");
        renderCategoryPage();
        notify("Вещь удалена");
    };
    openModal("confirmModal");
}

// ============================================
// 16. AUTH UI TOGGLE (Login / Register forms)
// ============================================

function showLoginForm() {
    $("#authModalTitle").textContent = "Вход";
    $("#loginForm").classList.remove("hidden");
    $("#registerForm").classList.add("hidden");
    $("#loginError").textContent = "";
}

function showRegisterForm() {
    $("#authModalTitle").textContent = "Регистрация";
    $("#loginForm").classList.add("hidden");
    $("#registerForm").classList.remove("hidden");
    $("#registerError").textContent = "";
}

// ============================================
// 17. EVENT LISTENERS
// ============================================

function initEvents() {
    // Profile button
    $("#profileBtn").addEventListener("click", () => {
        if (State.user) {
            // Если авторизован — выход
            if (confirm("Выйти из аккаунта?")) {
                logout().then(() => {
                    State.user = null;
                    State.categories = [];
                    navigateToHome();
                    notify("Вы вышли из аккаунта");
                });
            }
        } else {
            showLoginForm();
            openModal("authModal");
        }
    });

    // Add category
    $("#addCategoryBtn").addEventListener("click", () => {
        if (!State.user) { notify("Сначала войдите в систему", "error"); openModal("authModal"); return; }
        openAddCategoryModal();
    });

    // Back
    $("#backBtn").addEventListener("click", navigateToHome);

    // Add subgroup
    $("#addSubgroupBtn").addEventListener("click", openAddSubgroupModal);

    // Add item directly
    $("#addItemDirectBtn").addEventListener("click", () => openAddItemModal());

    // Close modals
    $$(".modal-close, [data-modal]").forEach(btn => {
        btn.addEventListener("click", () => closeModal(btn.dataset.modal));
    });

    // Click outside modal
    $$(".modal").forEach(m => {
        m.addEventListener("click", e => { if (e.target === m) closeModal(m.id); });
    });

    // Escape
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") closeAllModals();
    });

    // Auth form switch
    $("#showRegister").addEventListener("click", showRegisterForm);
    $("#showLogin").addEventListener("click", showLoginForm);

    // LOGIN
    $("#loginForm").addEventListener("submit", async e => {
        e.preventDefault();
        const email = $("#loginEmail").value.trim();
        const pass = $("#loginPassword").value;
        const err = $("#loginError");
        try {
            await login(email, pass);
            closeModal("authModal");
            notify("Вход выполнен!");
        } catch (error) {
            err.textContent = getAuthErrorMsg(error.code);
        }
    });

    // REGISTER
    $("#registerForm").addEventListener("submit", async e => {
        e.preventDefault();
        const email = $("#registerEmail").value.trim();
        const pass = $("#registerPassword").value;
        const pass2 = $("#registerPasswordConfirm").value;
        const err = $("#registerError");

        if (pass !== pass2) { err.textContent = "Пароли не совпадают"; return; }
        if (pass.length < 6) { err.textContent = "Пароль минимум 6 символов"; return; }

        try {
            await register(email, pass);
            closeModal("authModal");
            notify("Регистрация успешна!");
        } catch (error) {
            err.textContent = getAuthErrorMsg(error.code);
        }
    });

    // CATEGORY FORM
    $("#categoryForm").addEventListener("submit", async e => {
        e.preventDefault();
        const id = $("#categoryId").value;
        const name = $("#categoryNameInput").value.trim();
        const err = $("#categoryError");
        if (!name) { err.textContent = "Введите название"; return; }

        if (id) {
            await updateCategory(id, name);
            notify("Категория обновлена");
        } else {
            await createCategory(name);
            notify("Категория создана");
        }
        closeModal("categoryModal");
        renderCategories();
    });

    // SUBGROUP FORM
    $("#subgroupForm").addEventListener("submit", async e => {
        e.preventDefault();
        const id = $("#subgroupId").value;
        const name = $("#subgroupNameInput").value.trim();
        const err = $("#subgroupError");
        if (!name) { err.textContent = "Введите название"; return; }

        if (id) {
            await updateSubgroup(State.currentCategory, id, name);
            notify("Подгруппа обновлена");
        } else {
            await createSubgroup(State.currentCategory, name);
            notify("Подгруппа создана");
        }
        closeModal("subgroupModal");
        renderCategoryPage();
    });

    // ITEM FORM
    $("#itemForm").addEventListener("submit", async e => {
        e.preventDefault();
        const id = $("#itemId").value;
        const sgId = $("#itemSubgroupId").value;
        const name = $("#itemNameInput").value.trim();
        const price = $("#itemPriceInput").value;
        const err = $("#itemError");

        if (!name) { err.textContent = "Введите название"; return; }
        if (price < 0) { err.textContent = "Цена не может быть отрицательной"; return; }

        if (id) {
            await updateItem(State.currentCategory, sgId, id, name, price);
            notify("Вещь обновлена");
        } else {
            await createItem(State.currentCategory, sgId || null, name, price);
            notify("Вещь добавлена");
        }
        closeModal("itemModal");
        renderCategoryPage();
    });

    // Delete subgroup with items
    $("#moveItemsBtn").addEventListener("click", async () => {
        if (pendingDeleteSgId) {
            await deleteSubgroup(State.currentCategory, pendingDeleteSgId, false);
            pendingDeleteSgId = null;
            closeModal("deleteSubgroupModal");
            renderCategoryPage();
            notify('Подгруппа удалена, вещи перенесены в "Общее"');
        }
    });

    $("#deleteItemsBtn").addEventListener("click", async () => {
        if (pendingDeleteSgId) {
            await deleteSubgroup(State.currentCategory, pendingDeleteSgId, true);
            pendingDeleteSgId = null;
            closeModal("deleteSubgroupModal");
            renderCategoryPage();
            notify("Подгруппа и вещи удалены");
        }
    });
}

// ============================================
// 18. AUTH ERROR MESSAGES (RU)
// ============================================

function getAuthErrorMsg(code) {
    const map = {
        "auth/invalid-email": "Неверный формат email",
        "auth/user-disabled": "Аккаунт заблокирован",
        "auth/user-not-found": "Пользователь не найден",
        "auth/wrong-password": "Неверный пароль",
        "auth/invalid-credential": "Неверный email или пароль",
        "auth/email-already-in-use": "Email уже используется",
        "auth/weak-password": "Пароль слишком простой (минимум 6 символов)",
        "auth/too-many-requests": "Слишком много попыток. Попробуйте позже",
        "auth/network-request-failed": "Ошибка сети. Проверьте подключение",
    };
    return map[code] || "Ошибка авторизации: " + code;
}

// ============================================
// 19. AUTH STATE OBSERVER (Главный!)
// ============================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Пользователь вошёл
        State.user = user;
        await loadUserData();
        subscribeToUserData();
        refreshUI();
    } else {
        // Пользователь вышел
        if (State.unsubscribe) { State.unsubscribe(); State.unsubscribe = null; }
        State.user = null;
        State.categories = [];
        State.currentCategory = null;
        refreshUI();
    }
});

// ============================================
// 20. INIT
// ============================================

document.addEventListener("DOMContentLoaded", () => {
    $("#currentYear").textContent = new Date().getFullYear();
    initEvents();
    console.log("🎁 Мой Вишлист — Firebase Edition запущен");
});
