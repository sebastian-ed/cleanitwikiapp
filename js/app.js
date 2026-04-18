import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const CONFIG = window.APP_CONFIG || {};
const PLACEHOLDER_VALUES = ['https://TU-PROYECTO.supabase.co', 'TU_ANON_KEY', '', null, undefined];
const HAS_CONFIG = !PLACEHOLDER_VALUES.includes(CONFIG.SUPABASE_URL) && !PLACEHOLDER_VALUES.includes(CONFIG.SUPABASE_ANON_KEY);

const state = {
  session: null,
  user: null,
  profile: null,
  settings: {},
  spaces: [],
  categories: [],
  pages: [],
  resources: [],
  users: [],
  route: { view: 'home', tab: 'content', id: '', q: '' },
  resourceUrlCache: new Map(),
  isPasswordRecovery: false,
};

const els = {
  app: document.getElementById('app'),
  setupScreen: document.getElementById('setup-screen'),
  authScreen: document.getElementById('auth-screen'),
  appShell: document.getElementById('app-shell'),
  authMessage: document.getElementById('auth-message'),
  mainContent: document.getElementById('main-content'),
  contextBody: document.getElementById('context-panel-body'),
  treeNav: document.getElementById('tree-nav'),
  pageTitle: document.getElementById('page-title'),
  pageKicker: document.getElementById('page-kicker'),
  profileName: document.getElementById('profile-name'),
  profileRole: document.getElementById('profile-role'),
  profileAvatar: document.getElementById('profile-avatar'),
  sidebarSearchInput: document.getElementById('sidebar-search-input'),
  quickNewPage: document.getElementById('quick-new-page'),
  sidebarBrandName: document.getElementById('sidebar-brand-name'),
  authBrandName: document.getElementById('auth-brand-name'),
  authHeroTitle: document.getElementById('auth-hero-title'),
  authHeroCopy: document.getElementById('auth-hero-copy'),
  brandMarkSidebar: document.getElementById('brand-mark-sidebar'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modal-title'),
  modalKicker: document.getElementById('modal-kicker'),
  modalContent: document.getElementById('modal-content'),
};

let supabase = null;

if (!HAS_CONFIG) {
  els.setupScreen.classList.remove('hidden');
  document.title = 'Configurar Clean It Wiki';
} else {
  supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  bindGlobalEvents();
  init().catch(handleError);
}

async function init() {
  await ensureRuntimeDependencies();
  applyBrandingFromConfig();
  els.authScreen.classList.remove('hidden');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  await applySession(sessionData.session);

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      state.isPasswordRecovery = true;
      openPasswordRecoveryForm();
      return;
    }

    if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION'].includes(event)) {
      await applySession(session);
      return;
    }

    if (event === 'SIGNED_OUT') {
      resetStateForLogout();
      renderRoute();
    }
  });

  handleHashChange();
}

async function ensureRuntimeDependencies() {
  const startedAt = Date.now();
  while ((!window.marked || !window.DOMPurify) && Date.now() - startedAt < 4000) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function bindGlobalEvents() {
  window.addEventListener('hashchange', handleHashChange);

  document.querySelectorAll('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => switchAuthTab(button.dataset.authTab));
  });

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('signup-form').addEventListener('submit', handleSignup);
  document.getElementById('recover-form').addEventListener('submit', handleRecoverPassword);
  document.getElementById('password-reset-form').addEventListener('submit', handlePasswordReset);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('open-account-btn').addEventListener('click', openAccountModal);
  document.getElementById('quick-new-page').addEventListener('click', () => openPageForm());
  document.getElementById('modal-close').addEventListener('click', closeModal);
  els.modal.addEventListener('click', (event) => {
    const isBackdrop = event.target === els.modal;
    if (isBackdrop) closeModal();
  });
  document.getElementById('sidebar-toggle').addEventListener('click', closeSidebar);
  document.getElementById('open-sidebar-btn').addEventListener('click', openSidebar);

  document.addEventListener('click', (event) => {
    const jumpView = event.target.closest('[data-jump-view]');
    if (jumpView) {
      setRoute({ view: jumpView.dataset.jumpView, tab: jumpView.dataset.jumpTab || undefined, id: jumpView.dataset.jumpId || undefined });
      closeSidebar();
      return;
    }

    const jumpSpace = event.target.closest('[data-jump-space]');
    if (jumpSpace) {
      setRoute({ view: 'space', id: jumpSpace.dataset.jumpSpace });
      closeSidebar();
      return;
    }

    const jumpPage = event.target.closest('[data-jump-page]');
    if (jumpPage) {
      setRoute({ view: 'page', id: jumpPage.dataset.jumpPage });
      closeSidebar();
      return;
    }

    const scrollTarget = event.target.closest('[data-scroll-target]');
    if (scrollTarget) {
      const node = document.getElementById(scrollTarget.dataset.scrollTarget);
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  document.querySelectorAll('.nav-link').forEach((button) => {
    button.addEventListener('click', () => {
      setRoute({ view: button.dataset.view });
      closeSidebar();
    });
  });

  let searchTimer = null;
  els.sidebarSearchInput.addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = event.target.value.trim();
      if (!q) return;
      setRoute({ view: 'search', q });
    }, 350);
  });
}

function handleHashChange() {
  state.route = parseHash();
  renderRoute();
}

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(raw);
  return {
    view: params.get('view') || 'home',
    tab: params.get('tab') || 'content',
    id: params.get('id') || '',
    q: params.get('q') || '',
  };
}

function setRoute(values = {}) {
  const params = new URLSearchParams();
  const next = { ...state.route, ...values };
  Object.entries(next).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, value);
  });
  window.location.hash = params.toString();
}

async function applySession(session) {
  state.session = session;
  state.user = session?.user || null;

  if (!state.user) {
    els.authScreen.classList.remove('hidden');
    els.appShell.classList.add('hidden');
    switchAuthTab(state.isPasswordRecovery ? 'recover' : 'login');
    return;
  }

  await loadWorkspace();
  els.authScreen.classList.add('hidden');
  els.appShell.classList.remove('hidden');
  renderUserBadge();
  renderSidebarTree();
  renderRoute();
}

async function loadWorkspace() {
  const [{ data: profile, error: profileError }, { data: settingsRows, error: settingsError }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', state.user.id).single(),
    supabase.from('app_settings').select('*'),
  ]);

  if (profileError) throw profileError;
  if (settingsError) throw settingsError;

  state.profile = profile;
  state.settings = Object.fromEntries((settingsRows || []).map((item) => [item.key, item.value]));
  applyBranding(state.settings.branding || {});

  if (!state.profile.is_active) {
    await supabase.auth.signOut();
    throw new Error('Tu usuario está inhabilitado. Necesitás que un administrador te reactive.');
  }

  const isAdmin = state.profile.role === 'admin';

  const pageQuery = supabase
    .from('pages')
    .select('*')
    .order('nav_order', { ascending: true })
    .order('title', { ascending: true });

  const resourceQuery = supabase
    .from('resources')
    .select('*')
    .order('created_at', { ascending: false });

  if (!isAdmin) {
    pageQuery.eq('status', 'published');
    resourceQuery.eq('status', 'published');
  }

  const [spacesRes, categoriesRes, pagesRes, resourcesRes, usersRes] = await Promise.all([
    supabase.from('spaces').select('*').eq('is_active', true).order('nav_order', { ascending: true }).order('name'),
    supabase.from('categories').select('*').eq('is_active', true).order('nav_order', { ascending: true }).order('name'),
    pageQuery,
    resourceQuery,
    isAdmin ? supabase.from('profiles').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);

  [spacesRes, categoriesRes, pagesRes, resourcesRes].forEach((result) => {
    if (result.error) throw result.error;
  });
  if (usersRes?.error) throw usersRes.error;

  state.spaces = spacesRes.data || [];
  state.categories = categoriesRes.data || [];
  state.pages = (pagesRes.data || []).filter((page) => page.status === 'published' || isAdmin);
  state.resources = resourcesRes.data || [];
  state.users = usersRes?.data || [];

  document.querySelectorAll('.admin-only').forEach((node) => {
    node.classList.toggle('hidden', !isAdmin);
  });
}

function resetStateForLogout() {
  state.session = null;
  state.user = null;
  state.profile = null;
  state.spaces = [];
  state.categories = [];
  state.pages = [];
  state.resources = [];
  state.users = [];
  state.resourceUrlCache.clear();
  els.authScreen.classList.remove('hidden');
  els.appShell.classList.add('hidden');
  switchAuthTab('login');
}

function applyBrandingFromConfig() {
  const appName = CONFIG.APP_NAME || 'Clean It Wiki';
  document.title = appName;
  els.sidebarBrandName.textContent = appName;
  els.authBrandName.textContent = appName;
  els.authHeroTitle.textContent = 'Tu operación no necesita más chats perdidos ni PDFs sueltos.';
  els.authHeroCopy.textContent = 'Centralizá procedimientos, RRHH, capacitación, archivos y documentación en un único punto de verdad.';
  document.documentElement.style.setProperty('--primary', CONFIG.DEFAULT_PRIMARY_COLOR || '#1f6feb');
}

function applyBranding(branding = {}) {
  const appName = branding.app_name || CONFIG.APP_NAME || 'Clean It Wiki';
  const tagline = branding.tagline || CONFIG.APP_TAGLINE || 'Base viva de conocimiento interno';
  const primaryColor = branding.primary_color || CONFIG.DEFAULT_PRIMARY_COLOR || '#1f6feb';
  const heroTitle = branding.home_title || 'Tu operación no necesita más chats perdidos ni PDFs sueltos.';
  const heroCopy = branding.home_copy || 'Centralizá procedimientos, RRHH, capacitación, archivos y documentación en un único punto de verdad.';
  const logoText = branding.logo_text || 'CI';

  document.title = appName;
  els.sidebarBrandName.textContent = appName;
  els.authBrandName.textContent = appName;
  els.authHeroTitle.textContent = heroTitle;
  els.authHeroCopy.textContent = heroCopy;
  document.documentElement.style.setProperty('--primary', primaryColor);
  document.documentElement.style.setProperty('--primary-soft', hexToRgba(primaryColor, 0.12));
  els.brandMarkSidebar.textContent = logoText;

  const taglineNode = els.sidebarBrandName.nextElementSibling;
  if (taglineNode) taglineNode.textContent = tagline;
}

function renderRoute() {
  if (!state.user) return;

  const view = state.route.view;
  highlightTopLevelNav(view);

  if (view === 'page') return renderPageView(state.route.id);
  if (view === 'space') return renderSpaceView(state.route.id);
  if (view === 'search') return renderSearchView(state.route.q);
  if (view === 'library') return renderLibraryView();
  if (view === 'admin') return renderAdminView(state.route.tab);
  return renderHomeView();
}

function highlightTopLevelNav(view) {
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
}

function renderUserBadge() {
  if (!state.profile) return;
  const name = state.profile.full_name || state.profile.email || 'Usuario';
  els.profileName.textContent = name;
  els.profileRole.textContent = `${state.profile.role} · ${state.profile.department || 'sin área'}`;
  els.profileAvatar.textContent = getInitials(name);
}

function renderSidebarTree() {
  const pages = visiblePages();
  const html = state.spaces
    .map((space) => {
      const cats = state.categories.filter((cat) => cat.space_id === space.id && !cat.parent_id);
      const uncategorized = pages.filter((page) => page.space_id === space.id && !page.category_id);
      const isActiveSpace = state.route.view === 'space' && state.route.id === space.id;
      return `
        <div class="tree-group">
          <button class="tree-toggle ${isActiveSpace ? 'active' : ''}" data-space-id="${space.id}">${space.icon || '📚'} ${escapeHtml(space.name)}</button>
          <div class="tree-children">
            ${cats
              .map((cat) => renderCategoryNode(cat, pages))
              .join('')}
            ${uncategorized
              .map(
                (page) => `<button class="tree-item ${page.id === state.route.id ? 'active' : ''}" data-page-id="${page.id}">${escapeHtml(page.icon || '📄')} ${escapeHtml(page.title)}</button>`
              )
              .join('')}
          </div>
        </div>
      `;
    })
    .join('');

  els.treeNav.innerHTML = html || `<div class="muted small">Todavía no hay áreas publicadas.</div>`;

  els.treeNav.querySelectorAll('[data-page-id]').forEach((button) => {
    button.addEventListener('click', () => {
      setRoute({ view: 'page', id: button.dataset.pageId });
      closeSidebar();
    });
  });

  els.treeNav.querySelectorAll('[data-space-id]').forEach((button) => {
    button.addEventListener('click', () => {
      setRoute({ view: 'space', id: button.dataset.spaceId });
      closeSidebar();
    });
  });
}

function renderCategoryNode(category, pages) {
  const relatedPages = pages.filter((page) => page.category_id === category.id);
  const children = state.categories.filter((child) => child.parent_id === category.id);
  return `
    <div class="tree-node">
      <div class="tree-node-head">
        <div class="small muted">${escapeHtml(category.icon || '🗂️')} ${escapeHtml(category.name)}</div>
      </div>
      <div class="tree-children">
        ${children.map((child) => renderCategoryNode(child, pages)).join('')}
        ${relatedPages
          .map(
            (page) => `<button class="tree-item ${page.id === state.route.id ? 'active' : ''}" data-page-id="${page.id}">${escapeHtml(page.icon || '📄')} ${escapeHtml(page.title)}</button>`
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderHomeView() {
  const pages = visiblePages();
  const featured = pages.filter((page) => page.featured).slice(0, 6);
  const recentResources = visibleResources().slice(0, 6);
  const stats = {
    spaces: state.spaces.length,
    pages: pages.length,
    resources: visibleResources().length,
    users: state.profile.role === 'admin' ? state.users.length : null,
  };

  els.pageTitle.textContent = 'Inicio';
  els.pageKicker.textContent = 'Vista general';

  const branding = state.settings.branding || {};
  const heroTitle = branding.home_title || 'Base viva de conocimiento';
  const heroCopy = branding.home_copy || 'La empresa deja de depender de audios, PDFs desperdigados y memoria tribal.';

  const bootstrapCallout = state.profile.role !== 'admin' ? `
    <div class="callout warn">
      <strong>Acceso estándar</strong>
      <span>Solo los administradores pueden editar la wiki. Si esta es la primera cuenta del sistema y todavía no existe ningún admin, podés reclamar el rol inicial.</span>
      <div><button class="btn primary" type="button" id="bootstrap-admin-btn">Convertirme en primer admin</button></div>
    </div>
  ` : '';

  els.mainContent.innerHTML = `
    <section class="hero-card card">
      <div class="badge primary">${escapeHtml(branding.tagline || CONFIG.APP_TAGLINE || 'Base viva de conocimiento interno')}</div>
      <h2>${escapeHtml(heroTitle)}</h2>
      <p class="muted">${escapeHtml(heroCopy)}</p>
      <div class="quick-actions">
        <button class="btn primary" type="button" id="go-library-btn">Explorar biblioteca</button>
        <button class="btn ghost" type="button" id="go-account-btn">Actualizar mi cuenta</button>
      </div>
    </section>

    ${bootstrapCallout}

    <section class="stats-grid">
      <article class="metric-card">
        <div class="metric-card-head"><span class="badge">Áreas</span></div>
        <div class="metric-number">${stats.spaces}</div>
      </article>
      <article class="metric-card">
        <div class="metric-card-head"><span class="badge">Páginas</span></div>
        <div class="metric-number">${stats.pages}</div>
      </article>
      <article class="metric-card">
        <div class="metric-card-head"><span class="badge">Recursos</span></div>
        <div class="metric-number">${stats.resources}</div>
      </article>
      ${stats.users !== null ? `
      <article class="metric-card">
        <div class="metric-card-head"><span class="badge">Usuarios</span></div>
        <div class="metric-number">${stats.users}</div>
      </article>` : ''}
    </section>

    <section class="section-card card">
      <div class="attachments-head">
        <h2>Áreas principales</h2>
      </div>
      <div class="area-grid">
        ${state.spaces
          .map((space) => {
            const firstPage = firstPageForSpace(space.id);
            return `
              <article class="page-card hoverable" data-space-card="${space.id}">
                <div class="page-card-head">
                  <div class="page-icon">${escapeHtml(space.icon || '📚')}</div>
                  <div>
                    <h3 class="page-card-title">${escapeHtml(space.name)}</h3>
                    <p class="page-card-summary muted">${escapeHtml(space.description || 'Sin descripción todavía.')}</p>
                  </div>
                </div>
                <div class="page-card-meta small muted">${firstPage ? 'Abrir área y ver contenidos disponibles' : 'Abrir área y empezar a estructurar contenido'}</div>
              </article>
            `;
          })
          .join('')}
      </div>
    </section>

    <section class="section-card card">
      <div class="attachments-head">
        <h2>Destacados</h2>
      </div>
      <div class="page-grid">
        ${featured.length ? featured.map(renderPageCard).join('') : renderEmptyBlock('Todavía no hay páginas destacadas.', 'Marcá páginas como destacadas desde el panel de administración.')}
      </div>
    </section>

    <section class="section-card card">
      <div class="attachments-head">
        <h2>Últimos recursos</h2>
      </div>
      <div class="resource-grid">
        ${recentResources.length ? recentResources.map(renderResourceCardStatic).join('') : renderEmptyBlock('No hay recursos cargados.', 'Subí PDFs, imágenes, links, videos o instructivos desde administración.')}
      </div>
    </section>
  `;

  document.getElementById('go-library-btn')?.addEventListener('click', () => setRoute({ view: 'library' }));
  document.getElementById('go-account-btn')?.addEventListener('click', openAccountModal);
  document.getElementById('bootstrap-admin-btn')?.addEventListener('click', bootstrapFirstAdmin);
  document.querySelectorAll('[data-space-card]').forEach((card) => {
    card.addEventListener('click', () => {
      const page = firstPageForSpace(card.dataset.spaceCard);
      setRoute({ view: 'space', id: card.dataset.spaceCard });
    });
  });
  attachPageCardEvents();
  attachResourceCardEvents();
  renderContextPanelHome();
}


function renderSpaceView(spaceId) {
  const space = state.spaces.find((item) => item.id === spaceId) || state.spaces[0] || null;
  if (!space) {
    els.pageTitle.textContent = 'Áreas';
    els.pageKicker.textContent = 'Wiki';
    els.mainContent.innerHTML = renderEmptyBlock('Todavía no hay áreas creadas.', state.profile.role === 'admin' ? 'Creá la primera área desde Administración.' : 'Pedile a un administrador que configure la estructura inicial.');
    renderContextPanelGeneric();
    return;
  }

  const pages = visiblePages().filter((page) => page.space_id === space.id);
  const resources = visibleResources().filter((resource) => resource.space_id === space.id);
  const rootCategories = state.categories.filter((cat) => cat.space_id === space.id && !cat.parent_id && cat.is_active !== false);
  const uncategorizedPages = pages.filter((page) => !page.category_id);

  els.pageTitle.textContent = space.name;
  els.pageKicker.textContent = 'Área';

  const categoryHtml = rootCategories.length
    ? rootCategories.map((category) => {
        const childPages = pages.filter((page) => page.category_id === category.id);
        const childCategories = state.categories.filter((item) => item.parent_id === category.id && item.is_active !== false);
        return `
          <article class="section-card card">
            <div class="attachments-head">
              <h2>${escapeHtml(category.icon || '🗂️')} ${escapeHtml(category.name)}</h2>
            </div>
            ${category.description ? `<p class="muted">${escapeHtml(category.description)}</p>` : ''}
            ${childCategories.length ? `
              <div class="pill-group">
                ${childCategories.map((child) => `<span class="pill">${escapeHtml(child.icon || '📁')} ${escapeHtml(child.name)}</span>`).join('')}
              </div>
            ` : ''}
            <div class="page-grid">
              ${childPages.length ? childPages.map(renderPageCard).join('') : renderEmptyBlock('Todavía no hay páginas publicadas en esta categoría.', state.profile.role === 'admin' ? 'Podés crear la primera desde el panel admin.' : 'Esta sección todavía no tiene material publicado.')}
            </div>
          </article>
        `;
      }).join('')
    : '';

  els.mainContent.innerHTML = `
    <section class="hero-card card">
      <div class="badge primary">${escapeHtml(space.icon || '📚')} Área</div>
      <h2>${escapeHtml(space.name)}</h2>
      <p class="muted">${escapeHtml(space.description || 'Todavía no hay una descripción para esta área.')}</p>
      <div class="meta-grid">
        <span class="badge">Páginas: ${pages.length}</span>
        <span class="badge">Recursos: ${resources.length}</span>
        ${state.profile.role === 'admin' ? `<button class="btn primary" type="button" id="new-page-for-space-btn">Nueva página en esta área</button>` : ''}
      </div>
    </section>

    ${uncategorizedPages.length ? `
      <section class="section-card card">
        <div class="attachments-head">
          <h2>Páginas principales</h2>
        </div>
        <div class="page-grid">
          ${uncategorizedPages.map(renderPageCard).join('')}
        </div>
      </section>
    ` : ''}

    ${categoryHtml || renderEmptyBlock('Esta área todavía no tiene páginas publicadas.', state.profile.role === 'admin' ? 'La estructura existe, pero el contenido todavía no. Hora de cargar material útil.' : 'Todavía no hay contenido visible para esta área.')}

    <section class="section-card card">
      <div class="attachments-head">
        <h2>Recursos del área</h2>
      </div>
      <div class="resource-grid">
        ${resources.length ? resources.slice(0, 12).map(renderResourceCardStatic).join('') : renderEmptyBlock('No hay recursos asociados a esta área.', state.profile.role === 'admin' ? 'Subí archivos, links o videos desde Biblioteca o Administración.' : 'Esta área todavía no tiene adjuntos publicados.')}
      </div>
    </section>
  `;

  document.getElementById('new-page-for-space-btn')?.addEventListener('click', () => openPageForm({ space_id: space.id }));
  attachPageCardEvents();
  attachResourceCardEvents();
  renderContextPanelSpace(space, pages, resources, rootCategories);
}

function renderLibraryView() {
  els.pageTitle.textContent = 'Biblioteca';
  els.pageKicker.textContent = 'Recursos';

  const resources = visibleResources();
  const options = state.spaces
    .map((space) => `<option value="${space.id}">${escapeHtml(space.name)}</option>`)
    .join('');

  els.mainContent.innerHTML = `
    <section class="section-card card">
      <div class="filter-bar">
        <input id="library-search" type="search" placeholder="Buscar archivo, video, link o imagen..." value="${escapeHtml(state.route.q || '')}" />
        <select id="library-space-filter">
          <option value="">Todas las áreas</option>
          ${options}
        </select>
        ${state.profile.role === 'admin' ? `<button class="btn primary" type="button" id="new-resource-btn">Nuevo recurso</button>` : ''}
      </div>
    </section>
    <section id="library-results" class="resource-grid"></section>
  `;

  const searchInput = document.getElementById('library-search');
  const spaceFilter = document.getElementById('library-space-filter');
  const resultsContainer = document.getElementById('library-results');

  const applyFilters = async () => {
    const q = searchInput.value.trim().toLowerCase();
    const spaceId = spaceFilter.value;
    const filtered = resources.filter((resource) => {
      const haystack = [resource.title, resource.description, resource.folder, resource.mime_type].join(' ').toLowerCase();
      const matchesText = !q || haystack.includes(q);
      const matchesSpace = !spaceId || resource.space_id === spaceId;
      return matchesText && matchesSpace;
    });

    if (!filtered.length) {
      resultsContainer.innerHTML = renderEmptyBlock('No encontré recursos con ese filtro.', 'Ajustá la búsqueda o cargá nuevo material.');
      return;
    }

    resultsContainer.innerHTML = filtered.map(renderResourceCardStatic).join('');
    attachResourceCardEvents();
  };

  searchInput.addEventListener('input', applyFilters);
  spaceFilter.addEventListener('change', applyFilters);
  document.getElementById('new-resource-btn')?.addEventListener('click', () => openResourceForm());

  applyFilters();
  renderContextPanelLibrary();
}

async function renderPageView(pageId) {
  const page = state.pages.find((item) => item.id === pageId) || firstPublishedPage();
  if (!page) {
    els.pageTitle.textContent = 'Sin contenido';
    els.pageKicker.textContent = 'Wiki';
    els.mainContent.innerHTML = renderEmptyBlock('Todavía no hay páginas publicadas.', state.profile.role === 'admin' ? 'Empezá creando la primera desde Administración.' : 'Pedile a un administrador que cargue el contenido inicial.');
    renderContextPanelGeneric();
    return;
  }

  const space = state.spaces.find((item) => item.id === page.space_id);
  const category = state.categories.find((item) => item.id === page.category_id);
  const resources = visibleResources().filter((resource) => resource.linked_page_id === page.id);
  const { html, toc } = renderMarkdownWithToc(page.body_md || '');

  els.pageTitle.textContent = page.title;
  els.pageKicker.textContent = space?.name || 'Página';

  els.mainContent.innerHTML = `
    <section class="page-view card">
      <div class="page-header">
        <div class="breadcrumbs">
          <span>${escapeHtml(space?.name || 'Área')}</span>
          ${category ? `<span>•</span><span>${escapeHtml(category.name)}</span>` : ''}
          <span>•</span>
          <span>${page.status === 'published' ? 'Publicado' : 'Borrador'}</span>
        </div>
        <div class="badge primary">${escapeHtml(page.icon || '📄')} ${escapeHtml(page.visibility || 'internal')}</div>
        <h1>${escapeHtml(page.title)}</h1>
        ${page.summary ? `<p class="muted">${escapeHtml(page.summary)}</p>` : ''}
        <div class="page-actions">
          ${resources.length ? `<button class="btn ghost" type="button" id="jump-attachments-btn">Ver adjuntos</button>` : ''}
          ${state.profile.role === 'admin' ? `<button class="btn primary" type="button" id="edit-page-btn">Editar página</button>` : ''}
        </div>
      </div>
      <article class="page-content" id="page-content">${html}</article>
      <section id="attachments-section" class="section-card card ${resources.length ? '' : 'hidden'}">
        <div class="attachments-head">
          <h2>Adjuntos y recursos</h2>
        </div>
        <div class="resource-grid">
          ${resources.map(renderResourceCardStatic).join('')}
        </div>
      </section>
    </section>
  `;

  document.getElementById('edit-page-btn')?.addEventListener('click', () => openPageForm(page));
  document.getElementById('jump-attachments-btn')?.addEventListener('click', () => document.getElementById('attachments-section')?.scrollIntoView({ behavior: 'smooth' }));
  attachResourceCardEvents();
  renderContextPanelPage(page, toc, resources);
}

function renderSearchView(query) {
  const q = (query || '').trim().toLowerCase();
  els.pageTitle.textContent = q ? `Buscar: ${query}` : 'Buscar';
  els.pageKicker.textContent = 'Resultados';

  if (!q) {
    els.mainContent.innerHTML = renderEmptyBlock('Escribí algo para buscar.', 'La wiki ya deja de ser una carpeta con amnesia, pero todavía necesita una consulta.');
    renderContextPanelGeneric();
    return;
  }

  const pages = visiblePages().filter((page) => [page.title, page.summary, page.body_md].join(' ').toLowerCase().includes(q));
  const resources = visibleResources().filter((resource) => [resource.title, resource.description, resource.folder, resource.mime_type].join(' ').toLowerCase().includes(q));

  els.mainContent.innerHTML = `
    <section class="search-grid">
      <article class="section-card card">
        <h2>Páginas (${pages.length})</h2>
        <div class="list-stack">
          ${pages.length
            ? pages
                .map(
                  (page) => `
                <article class="search-result">
                  <div class="badge primary">${escapeHtml(page.icon || '📄')} Página</div>
                  <h3>${escapeHtml(page.title)}</h3>
                  <p class="muted">${escapeHtml(page.summary || summarize(page.body_md || '', 180))}</p>
                  <p><button class="btn ghost" type="button" data-open-page="${page.id}">Abrir</button></p>
                </article>
              `
                )
                .join('')
            : renderEmptyBlock('No encontré páginas con ese criterio.', 'Probá otra palabra clave o revisá que el contenido esté publicado.')}
        </div>
      </article>
      <article class="section-card card">
        <h2>Recursos (${resources.length})</h2>
        <div class="list-stack">
          ${resources.length
            ? resources.map(renderResourceCardStatic).join('')
            : renderEmptyBlock('No encontré recursos con ese criterio.', 'Probá otro término o cargá nuevo material desde administración.')}
        </div>
      </article>
    </section>
  `;

  document.querySelectorAll('[data-open-page]').forEach((button) => {
    button.addEventListener('click', () => setRoute({ view: 'page', id: button.dataset.openPage }));
  });
  attachResourceCardEvents();
  renderContextPanelSearch(q, pages, resources);
}

function renderAdminView(tab = 'content') {
  if (state.profile.role !== 'admin') {
    setRoute({ view: 'home' });
    return;
  }

  els.pageTitle.textContent = 'Administración';
  els.pageKicker.textContent = 'Backoffice';

  els.mainContent.innerHTML = `
    <section class="section-card card">
      <div class="tabs" id="admin-tabs">
        <button class="tab ${tab === 'content' ? 'active' : ''}" data-admin-tab="content">Contenido</button>
        <button class="tab ${tab === 'resources' ? 'active' : ''}" data-admin-tab="resources">Recursos</button>
        <button class="tab ${tab === 'users' ? 'active' : ''}" data-admin-tab="users">Usuarios</button>
        <button class="tab ${tab === 'branding' ? 'active' : ''}" data-admin-tab="branding">Branding</button>
      </div>
    </section>
    <section id="admin-view"></section>
  `;

  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.addEventListener('click', () => setRoute({ view: 'admin', tab: button.dataset.adminTab }));
  });

  const container = document.getElementById('admin-view');
  if (tab === 'resources') container.innerHTML = renderAdminResources();
  else if (tab === 'users') container.innerHTML = renderAdminUsers();
  else if (tab === 'branding') container.innerHTML = renderAdminBranding();
  else container.innerHTML = renderAdminContent();

  bindAdminViewEvents(tab);
  renderContextPanelAdmin(tab);
}

function renderAdminContent() {
  return `
    <section class="admin-grid">
      <article class="admin-card card">
        <div class="admin-toolbar">
          <h2>Estructura</h2>
          <div class="quick-actions">
            <button class="btn ghost" type="button" id="new-space-btn">Nueva área</button>
            <button class="btn ghost" type="button" id="new-category-btn">Nueva categoría</button>
            <button class="btn primary" type="button" id="new-page-admin-btn">Nueva página</button>
          </div>
        </div>
        <div class="table-shell">
          <table>
            <thead>
              <tr><th>Tipo</th><th>Nombre</th><th>Estado</th><th>Orden</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              ${state.spaces
                .map(
                  (space) => `
                    <tr>
                      <td>Área</td>
                      <td><strong>${escapeHtml(space.name)}</strong><br><span class="muted small">${escapeHtml(space.slug)}</span></td>
                      <td>${space.is_active ? '<span class="badge success">Activa</span>' : '<span class="badge danger">Inactiva</span>'}</td>
                      <td>${space.nav_order}</td>
                      <td class="row-actions">
                        <button class="btn ghost" type="button" data-edit-space="${space.id}">Editar</button>
                        <button class="btn ghost danger" type="button" data-delete-space="${space.id}">Eliminar</button>
                      </td>
                    </tr>
                  `
                )
                .join('')}
              ${state.categories
                .map(
                  (cat) => `
                    <tr>
                      <td>Categoría</td>
                      <td><strong>${escapeHtml(cat.name)}</strong><br><span class="muted small">${escapeHtml(cat.slug)}</span></td>
                      <td>${cat.is_active ? '<span class="badge success">Activa</span>' : '<span class="badge danger">Inactiva</span>'}</td>
                      <td>${cat.nav_order}</td>
                      <td class="row-actions">
                        <button class="btn ghost" type="button" data-edit-category="${cat.id}">Editar</button>
                        <button class="btn ghost danger" type="button" data-delete-category="${cat.id}">Eliminar</button>
                      </td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </article>
      <article class="admin-card card">
        <div class="admin-toolbar">
          <h2>Páginas</h2>
        </div>
        <div class="table-shell">
          <table>
            <thead>
              <tr><th>Título</th><th>Área</th><th>Estado</th><th>Adjuntos</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              ${state.pages
                .map(
                  (page) => `
                    <tr>
                      <td><strong>${escapeHtml(page.title)}</strong><br><span class="muted small">${escapeHtml(page.slug)}</span></td>
                      <td>${escapeHtml(spaceName(page.space_id))}</td>
                      <td>${page.status === 'published' ? '<span class="badge success">Publicado</span>' : '<span class="badge warning">Borrador</span>'}</td>
                      <td>${state.resources.filter((resource) => resource.linked_page_id === page.id).length}</td>
                      <td class="row-actions">
                        <button class="btn ghost" type="button" data-open-page="${page.id}">Ver</button>
                        <button class="btn ghost" type="button" data-edit-page="${page.id}">Editar</button>
                        <button class="btn ghost danger" type="button" data-delete-page="${page.id}">Eliminar</button>
                      </td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function renderAdminResources() {
  return `
    <section class="admin-card card">
      <div class="admin-toolbar">
        <h2>Recursos y adjuntos</h2>
        <button class="btn primary" type="button" id="new-resource-admin-btn">Nuevo recurso</button>
      </div>
      <div class="table-shell">
        <table>
          <thead>
            <tr><th>Título</th><th>Tipo</th><th>Estado</th><th>Ruta / URL</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            ${state.resources
              .map(
                (resource) => `
                  <tr>
                    <td><strong>${escapeHtml(resource.title)}</strong><br><span class="muted small">${escapeHtml(resource.folder || 'general')}</span></td>
                    <td>${escapeHtml(resource.kind)}</td>
                    <td>${resource.status === 'published' ? '<span class="badge success">Publicado</span>' : '<span class="badge warning">Borrador</span>'}</td>
                    <td class="small muted">${escapeHtml(resource.storage_path || resource.url || '-')}</td>
                    <td class="row-actions">
                      <button class="btn ghost" type="button" data-download-resource="${resource.id}">Abrir</button>
                      <button class="btn ghost" type="button" data-edit-resource="${resource.id}">Editar</button>
                      <button class="btn ghost danger" type="button" data-delete-resource="${resource.id}">Eliminar</button>
                    </td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAdminUsers() {
  return `
    <section class="admin-card card">
      <div class="admin-toolbar">
        <h2>Usuarios</h2>
      </div>
      <div class="callout info">
        <strong>Modelo de acceso</strong>
        <span>El alta inicial la hace cada persona desde la pantalla de registro. Desde acá definís rol, área e inhabilitación. Para creación forzada o reseteo administrativo de contraseñas conviene usar una Edge Function o el panel de Supabase.</span>
      </div>
      <div class="table-shell">
        <table>
          <thead>
            <tr><th>Usuario</th><th>Área</th><th>Rol</th><th>Activo</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            ${state.users
              .map(
                (user) => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(user.full_name || user.email)}</strong><br>
                      <span class="muted small">${escapeHtml(user.email || '-')}</span>
                    </td>
                    <td>
                      <input type="text" value="${escapeHtml(user.department || '')}" data-user-department="${user.id}" placeholder="Área" />
                    </td>
                    <td>
                      <select data-user-role="${user.id}">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>user</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
                      </select>
                    </td>
                    <td>
                      <button class="user-status-toggle ${user.is_active ? 'active' : ''}" type="button" data-user-active="${user.id}" aria-label="Cambiar estado"><span class="dot"></span></button>
                    </td>
                    <td>
                      <button class="btn ghost" type="button" data-save-user="${user.id}">Guardar</button>
                    </td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAdminBranding() {
  const branding = state.settings.branding || {};
  return `
    <section class="admin-card card">
      <div class="admin-toolbar">
        <h2>Branding y experiencia</h2>
        <button class="btn primary" type="button" id="edit-branding-btn">Editar branding</button>
      </div>
      <div class="meta-grid">
        <span class="badge primary">App: ${escapeHtml(branding.app_name || CONFIG.APP_NAME || 'Clean It Wiki')}</span>
        <span class="badge">Color primario: ${escapeHtml(branding.primary_color || CONFIG.DEFAULT_PRIMARY_COLOR || '#1f6feb')}</span>
        <span class="badge">Logo: ${escapeHtml(branding.logo_text || 'CI')}</span>
      </div>
      <article class="section-card card">
        <h3>Mensaje principal</h3>
        <p>${escapeHtml(branding.home_title || 'Base viva de conocimiento')}</p>
        <p class="muted">${escapeHtml(branding.home_copy || 'Sin copy de portada configurado todavía.')}</p>
      </article>
      <article class="section-card card">
        <h3>Tagline</h3>
        <p class="muted">${escapeHtml(branding.tagline || CONFIG.APP_TAGLINE || 'Base viva de conocimiento interno')}</p>
      </article>
    </section>
  `;
}

function bindAdminViewEvents(tab) {
  if (tab === 'content') {
    document.getElementById('new-space-btn')?.addEventListener('click', () => openSpaceForm());
    document.getElementById('new-category-btn')?.addEventListener('click', () => openCategoryForm());
    document.getElementById('new-page-admin-btn')?.addEventListener('click', () => openPageForm());

    document.querySelectorAll('[data-edit-space]').forEach((button) => button.addEventListener('click', () => openSpaceForm(state.spaces.find((item) => item.id === button.dataset.editSpace))));
    document.querySelectorAll('[data-delete-space]').forEach((button) => button.addEventListener('click', () => deleteRecord('spaces', button.dataset.deleteSpace, 'Área eliminada.')));

    document.querySelectorAll('[data-edit-category]').forEach((button) => button.addEventListener('click', () => openCategoryForm(state.categories.find((item) => item.id === button.dataset.editCategory))));
    document.querySelectorAll('[data-delete-category]').forEach((button) => button.addEventListener('click', () => deleteRecord('categories', button.dataset.deleteCategory, 'Categoría eliminada.')));

    document.querySelectorAll('[data-open-page]').forEach((button) => button.addEventListener('click', () => setRoute({ view: 'page', id: button.dataset.openPage })));
    document.querySelectorAll('[data-edit-page]').forEach((button) => button.addEventListener('click', () => openPageForm(state.pages.find((item) => item.id === button.dataset.editPage))));
    document.querySelectorAll('[data-delete-page]').forEach((button) => button.addEventListener('click', () => deleteRecord('pages', button.dataset.deletePage, 'Página eliminada.')));
  }

  if (tab === 'resources') {
    document.getElementById('new-resource-admin-btn')?.addEventListener('click', () => openResourceForm());
    document.querySelectorAll('[data-edit-resource]').forEach((button) => button.addEventListener('click', () => openResourceForm(state.resources.find((item) => item.id === button.dataset.editResource))));
    document.querySelectorAll('[data-delete-resource]').forEach((button) => button.addEventListener('click', () => deleteResource(button.dataset.deleteResource)));
    document.querySelectorAll('[data-download-resource]').forEach((button) => button.addEventListener('click', async () => {
      const resource = state.resources.find((item) => item.id === button.dataset.downloadResource);
      if (!resource) return;
      const url = await resolveResourceUrl(resource, true);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    }));
  }

  if (tab === 'users') {
    document.querySelectorAll('[data-user-active]').forEach((button) => {
      button.addEventListener('click', () => button.classList.toggle('active'));
    });
    document.querySelectorAll('[data-save-user]').forEach((button) => {
      button.addEventListener('click', () => saveUserRow(button.dataset.saveUser));
    });
  }

  if (tab === 'branding') {
    document.getElementById('edit-branding-btn')?.addEventListener('click', openBrandingForm);
  }
}

function renderPageCard(page) {
  const space = state.spaces.find((item) => item.id === page.space_id);
  return `
    <article class="page-card card hoverable" data-open-page="${page.id}">
      <div class="page-card-head">
        <div class="page-icon">${escapeHtml(page.icon || '📄')}</div>
        <div>
          <h3 class="page-card-title">${escapeHtml(page.title)}</h3>
          <p class="page-card-summary muted">${escapeHtml(page.summary || summarize(page.body_md || '', 120))}</p>
        </div>
      </div>
      <div class="page-card-meta small muted">${escapeHtml(space?.name || 'Sin área')}</div>
    </article>
  `;
}

function renderResourceCardStatic(resource) {
  const page = state.pages.find((item) => item.id === resource.linked_page_id);
  return `
    <article class="resource-card" data-resource-id="${resource.id}">
      <div class="resource-card-head">
        <div class="resource-icon">${resourceIcon(resource)}</div>
        <div>
          <h3 class="resource-card-title">${escapeHtml(resource.title)}</h3>
          <p class="muted small">${escapeHtml(resource.description || 'Sin descripción.')}</p>
        </div>
      </div>
      <div class="resource-meta">
        <span class="badge">${escapeHtml(resource.kind)}</span>
        ${resource.folder ? `<span class="badge">${escapeHtml(resource.folder)}</span>` : ''}
        ${page ? `<span class="badge primary">${escapeHtml(page.title)}</span>` : ''}
      </div>
      <div class="quick-actions">
        <button class="btn ghost" type="button" data-open-resource="${resource.id}">Abrir</button>
        ${state.profile?.role === 'admin' ? `<button class="btn ghost" type="button" data-edit-resource="${resource.id}">Editar</button>` : ''}
      </div>
    </article>
  `;
}

function renderContextPanelHome() {
  const adminLinks = state.profile?.role === 'admin'
    ? `
      <button class="link-btn" type="button" data-jump-view="admin" data-jump-tab="content">Administrar estructura</button>
      <button class="link-btn" type="button" data-jump-view="admin" data-jump-tab="users">Gestionar usuarios</button>
    `
    : '';

  els.contextBody.innerHTML = `
    <div class="list-stack small">
      <div class="callout info">
        <strong>Cómo usarla bien</strong>
        <span>Armá áreas por función: RRHH, Operaciones, Seguridad, Calidad, Comercial. Después bajá a categorías y páginas. Sin esa jerarquía, la wiki se transforma en un depósito digital con glamour.</span>
      </div>
      <div>
        <strong>Accesos rápidos</strong>
        <div class="list-stack">
          <button class="link-btn" type="button" data-jump-view="library">Abrir biblioteca</button>
          ${adminLinks}
        </div>
      </div>
    </div>
  `;
}

function renderContextPanelLibrary() {
  els.contextBody.innerHTML = `
    <div class="list-stack small">
      <div class="callout info">
        <strong>Biblioteca privada</strong>
        <span>Los archivos se sirven desde un bucket privado mediante URLs firmadas. Eso evita que el “manual interno” termine flotando libre por internet.</span>
      </div>
      <div>
        <strong>Sugerencia operativa</strong>
        <span class="muted">Usá carpetas coherentes: rrhh, manuales, seguridad, induccion, proveedores, formularios.</span>
      </div>
    </div>
  `;
}

function renderContextPanelPage(page, toc, resources) {
  els.contextBody.innerHTML = `
    <div class="list-stack small">
      <div>
        <strong>En esta página</strong>
        <div class="list-stack">
          ${toc.length ? toc.map((item) => `<button class="link-btn" type="button" data-scroll-target="${item.id}">${escapeHtml(item.text)}</button>`).join('') : '<span class="muted">Sin índice interno.</span>'}
        </div>
      </div>
      <div>
        <strong>Metadatos</strong>
        <div class="list-stack">
          <span class="muted">Estado: ${escapeHtml(page.status)}</span>
          <span class="muted">Adjuntos: ${resources.length}</span>
          <span class="muted">Última actualización: ${formatDate(page.updated_at)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderContextPanelSpace(space, pages, resources, categories) {
  const featuredPage = pages[0];
  els.contextBody.innerHTML = `
    <div class="list-stack small">
      <div class="callout info">
        <strong>${escapeHtml(space.name)}</strong>
        <span>${escapeHtml(space.description || 'Área operativa disponible para consulta interna.')}</span>
      </div>
      <div>
        <strong>Resumen</strong>
        <div class="list-stack">
          <span class="muted">Categorías: ${categories.length}</span>
          <span class="muted">Páginas: ${pages.length}</span>
          <span class="muted">Recursos: ${resources.length}</span>
        </div>
      </div>
      <div>
        <strong>Accesos rápidos</strong>
        <div class="list-stack">
          ${featuredPage ? `<button class="link-btn" type="button" data-jump-page="${featuredPage.id}">Abrir primera página publicada</button>` : '<span class="muted">No hay páginas publicadas todavía.</span>'}
          <button class="link-btn" type="button" data-jump-view="library">Ir a biblioteca</button>
        </div>
      </div>
    </div>
  `;
}

function renderContextPanelSearch(q, pages, resources) {
  els.contextBody.innerHTML = `
    <div class="list-stack small">
      <div class="callout info">
        <strong>Consulta</strong>
        <span>${escapeHtml(q)}</span>
      </div>
      <div>
        <strong>Resultados</strong>
        <div class="list-stack">
          <span class="muted">Páginas: ${pages.length}</span>
          <span class="muted">Recursos: ${resources.length}</span>
        </div>
      </div>
    </div>
  `;
}

function renderContextPanelAdmin(tab) {
  const descriptions = {
    content: 'Definí la estructura de la wiki: áreas, categorías y páginas.',
    resources: 'Subí archivos, links y videos. Mové, renombrá o eliminá recursos.',
    users: 'Asigná roles y desactivá accesos sin tocar la auth table manualmente.',
    branding: 'Ajustá nombre, tagline, color principal y mensajes de la portada.',
  };

  els.contextBody.innerHTML = `
    <div class="list-stack small">
      <div class="callout info">
        <strong>Panel ${escapeHtml(tab)}</strong>
        <span>${escapeHtml(descriptions[tab] || '')}</span>
      </div>
      <div>
        <strong>Recordatorio</strong>
        <span class="muted">No cargues material crítico en borradores eternos. La documentación vieja y ambigua es peor que no tener documentación.</span>
      </div>
    </div>
  `;
}

function renderContextPanelGeneric() {
  els.contextBody.innerHTML = `<span class="muted small">Seleccioná un contenido para ver contexto adicional.</span>`;
}

function attachPageCardEvents() {
  document.querySelectorAll('[data-open-page]').forEach((card) => {
    card.addEventListener('click', () => setRoute({ view: 'page', id: card.dataset.openPage }));
  });
}

function attachResourceCardEvents() {
  document.querySelectorAll('[data-open-resource]').forEach((button) => {
    button.addEventListener('click', async () => {
      const resource = state.resources.find((item) => item.id === button.dataset.openResource);
      if (!resource) return;
      const url = await resolveResourceUrl(resource, true);
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  });
  document.querySelectorAll('[data-edit-resource]').forEach((button) => {
    button.addEventListener('click', () => openResourceForm(state.resources.find((item) => item.id === button.dataset.editResource)));
  });
}

function openModal({ title, kicker = 'Edición', content }) {
  els.modalTitle.textContent = title;
  els.modalKicker.textContent = kicker;
  els.modalContent.innerHTML = content;
  els.modal.showModal();
}

function closeModal() {
  els.modal.close();
  els.modalContent.innerHTML = '';
}

function openSpaceForm(space = null) {
  openModal({
    title: space ? 'Editar área' : 'Nueva área',
    kicker: 'Estructura',
    content: `
      <form id="space-form" class="form-grid two">
        <input type="hidden" name="id" value="${space?.id || ''}" />
        <label><span>Nombre</span><input type="text" name="name" required value="${escapeHtml(space?.name || '')}" /></label>
        <label><span>Slug</span><input type="text" name="slug" required value="${escapeHtml(space?.slug || '')}" placeholder="rrhh" /></label>
        <label><span>Ícono</span><input type="text" name="icon" value="${escapeHtml(space?.icon || '📚')}" /></label>
        <label><span>Orden</span><input type="number" name="nav_order" value="${space?.nav_order ?? 100}" /></label>
        <label class="full"><span>Descripción</span><textarea name="description">${escapeHtml(space?.description || '')}</textarea></label>
        <label><span>Activa</span><select name="is_active"><option value="true" ${space?.is_active !== false ? 'selected' : ''}>Sí</option><option value="false" ${space?.is_active === false ? 'selected' : ''}>No</option></select></label>
        <div class="quick-actions"><button class="btn primary" type="submit">Guardar área</button></div>
      </form>
    `.replace('class="full"', 'style="grid-column:1 / -1"'),
  });

  document.getElementById('space-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get('name').trim(),
      slug: slugify(form.get('slug')),
      description: form.get('description').trim(),
      icon: form.get('icon').trim() || '📚',
      nav_order: Number(form.get('nav_order') || 100),
      is_active: form.get('is_active') === 'true',
      updated_by: state.user.id,
    };
    if (space) payload.id = space.id;
    else payload.created_by = state.user.id;
    await upsertRecord('spaces', payload, space ? 'Área actualizada.' : 'Área creada.');
    closeModal();
  });
}

function openCategoryForm(category = null) {
  const spaceOptions = state.spaces.map((space) => `<option value="${space.id}" ${category?.space_id === space.id ? 'selected' : ''}>${escapeHtml(space.name)}</option>`).join('');
  const parentOptions = [`<option value="">Sin categoría padre</option>`, ...state.categories.filter((item) => item.id !== category?.id).map((item) => `<option value="${item.id}" ${category?.parent_id === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)].join('');

  openModal({
    title: category ? 'Editar categoría' : 'Nueva categoría',
    kicker: 'Estructura',
    content: `
      <form id="category-form" class="form-grid two">
        <input type="hidden" name="id" value="${category?.id || ''}" />
        <label><span>Área</span><select name="space_id" required>${spaceOptions}</select></label>
        <label><span>Categoría padre</span><select name="parent_id">${parentOptions}</select></label>
        <label><span>Nombre</span><input type="text" name="name" required value="${escapeHtml(category?.name || '')}" /></label>
        <label><span>Slug</span><input type="text" name="slug" required value="${escapeHtml(category?.slug || '')}" /></label>
        <label><span>Ícono</span><input type="text" name="icon" value="${escapeHtml(category?.icon || '🗂️')}" /></label>
        <label><span>Orden</span><input type="number" name="nav_order" value="${category?.nav_order ?? 100}" /></label>
        <label style="grid-column:1 / -1"><span>Descripción</span><textarea name="description">${escapeHtml(category?.description || '')}</textarea></label>
        <label><span>Activa</span><select name="is_active"><option value="true" ${category?.is_active !== false ? 'selected' : ''}>Sí</option><option value="false" ${category?.is_active === false ? 'selected' : ''}>No</option></select></label>
        <div class="quick-actions"><button class="btn primary" type="submit">Guardar categoría</button></div>
      </form>
    `,
  });

  document.getElementById('category-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      space_id: form.get('space_id'),
      parent_id: form.get('parent_id') || null,
      name: form.get('name').trim(),
      slug: slugify(form.get('slug')),
      description: form.get('description').trim(),
      icon: form.get('icon').trim() || '🗂️',
      nav_order: Number(form.get('nav_order') || 100),
      is_active: form.get('is_active') === 'true',
      updated_by: state.user.id,
    };
    if (category) payload.id = category.id;
    else payload.created_by = state.user.id;
    await upsertRecord('categories', payload, category ? 'Categoría actualizada.' : 'Categoría creada.');
    closeModal();
  });
}

function openPageForm(page = null) {
  const isEdit = Boolean(page?.id);
  const spaceOptions = state.spaces.map((space) => `<option value="${space.id}" ${page?.space_id === space.id ? 'selected' : ''}>${escapeHtml(space.name)}</option>`).join('');
  const categoryOptions = [`<option value="">Sin categoría</option>`, ...state.categories.map((cat) => `<option value="${cat.id}" ${page?.category_id === cat.id ? 'selected' : ''}>${escapeHtml(spaceName(cat.space_id))} · ${escapeHtml(cat.name)}</option>`)].join('');
  const parentPageOptions = [`<option value="">Sin página padre</option>`, ...state.pages.filter((item) => item.id !== page?.id).map((item) => `<option value="${item.id}" ${page?.parent_page_id === item.id ? 'selected' : ''}>${escapeHtml(item.title)}</option>`)].join('');

  openModal({
    title: isEdit ? 'Editar página' : 'Nueva página',
    kicker: 'Contenido',
    content: `
      <form id="page-form" class="form-grid two">
        <input type="hidden" name="id" value="${page?.id || ''}" />
        <label><span>Título</span><input type="text" name="title" required value="${escapeHtml(page?.title || '')}" /></label>
        <label><span>Slug</span><input type="text" name="slug" required value="${escapeHtml(page?.slug || '')}" placeholder="recibo-de-sueldo" /></label>
        <label><span>Área</span><select name="space_id" required>${spaceOptions}</select></label>
        <label><span>Categoría</span><select name="category_id">${categoryOptions}</select></label>
        <label><span>Página padre</span><select name="parent_page_id">${parentPageOptions}</select></label>
        <label><span>Ícono</span><input type="text" name="icon" value="${escapeHtml(page?.icon || '📄')}" /></label>
        <label><span>Orden</span><input type="number" name="nav_order" value="${page?.nav_order ?? 100}" /></label>
        <label><span>Estado</span><select name="status"><option value="published" ${page?.status !== 'draft' ? 'selected' : ''}>Publicado</option><option value="draft" ${page?.status === 'draft' ? 'selected' : ''}>Borrador</option></select></label>
        <label><span>Visibilidad</span><select name="visibility"><option value="internal" ${page?.visibility !== 'public' ? 'selected' : ''}>internal</option><option value="public" ${page?.visibility === 'public' ? 'selected' : ''}>public</option></select></label>
        <label><span>Destacada</span><select name="featured"><option value="true" ${page?.featured ? 'selected' : ''}>Sí</option><option value="false" ${!page?.featured ? 'selected' : ''}>No</option></select></label>
        <label style="grid-column:1 / -1"><span>Resumen</span><textarea name="summary">${escapeHtml(page?.summary || '')}</textarea></label>
        <div style="grid-column:1 / -1" class="editor-toolbar">
          <button type="button" data-insert="## Título\n\nTexto...">H2</button>
          <button type="button" data-insert="### Subtítulo\n\nTexto...">H3</button>
          <button type="button" data-insert="- Punto 1\n- Punto 2\n- Punto 3">Lista</button>
          <button type="button" data-insert="> Nota importante\n">Cita</button>
          <button type="button" data-insert="[Texto del link](https://)">Link</button>
          <button type="button" data-insert="![Descripción](https://)">Imagen</button>
        </div>
        <label style="grid-column:1 / -1"><span>Contenido (Markdown)</span><textarea name="body_md" id="page-body-input" style="min-height:320px">${escapeHtml(page?.body_md || '')}</textarea></label>
        <div style="grid-column:1 / -1" class="callout info">
          <strong>Consejo de diseño</strong>
          <span>Estructurá la página con títulos cortos, pasos secuenciales, responsables, adjuntos y preguntas frecuentes. Si metés todo en un bloque eterno, la gente no aprende: escanea y abandona.</span>
        </div>
        <div class="quick-actions" style="grid-column:1 / -1"><button class="btn primary" type="submit">Guardar página</button></div>
      </form>
    `,
  });

  const bodyInput = document.getElementById('page-body-input');
  document.querySelectorAll('[data-insert]').forEach((button) => {
    button.addEventListener('click', () => insertAtCursor(bodyInput, button.dataset.insert));
  });

  document.getElementById('page-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get('title').trim(),
      slug: slugify(form.get('slug') || form.get('title')),
      space_id: form.get('space_id'),
      category_id: form.get('category_id') || null,
      parent_page_id: form.get('parent_page_id') || null,
      summary: form.get('summary').trim(),
      body_md: form.get('body_md'),
      icon: form.get('icon').trim() || '📄',
      nav_order: Number(form.get('nav_order') || 100),
      status: form.get('status'),
      visibility: form.get('visibility'),
      featured: form.get('featured') === 'true',
      updated_by: state.user.id,
    };
    if (isEdit) payload.id = page.id;
    else payload.created_by = state.user.id;
    await upsertRecord('pages', payload, isEdit ? 'Página actualizada.' : 'Página creada.');
    closeModal();
  });
}

function openResourceForm(resource = null) {
  const pageOptions = [`<option value="">Sin vincular</option>`, ...state.pages.map((page) => `<option value="${page.id}" ${resource?.linked_page_id === page.id ? 'selected' : ''}>${escapeHtml(page.title)}</option>`)].join('');
  const spaceOptions = [`<option value="">Sin área</option>`, ...state.spaces.map((space) => `<option value="${space.id}" ${resource?.space_id === space.id ? 'selected' : ''}>${escapeHtml(space.name)}</option>`)].join('');

  openModal({
    title: resource ? 'Editar recurso' : 'Nuevo recurso',
    kicker: 'Biblioteca',
    content: `
      <form id="resource-form" class="form-grid two">
        <input type="hidden" name="id" value="${resource?.id || ''}" />
        <label><span>Título</span><input type="text" name="title" required value="${escapeHtml(resource?.title || '')}" /></label>
        <label><span>Tipo</span>
          <select name="kind" id="resource-kind">
            ${['file', 'link', 'video', 'image', 'embed'].map((kind) => `<option value="${kind}" ${resource?.kind === kind ? 'selected' : ''}>${kind}</option>`).join('')}
          </select>
        </label>
        <label><span>Área</span><select name="space_id">${spaceOptions}</select></label>
        <label><span>Página vinculada</span><select name="linked_page_id">${pageOptions}</select></label>
        <label><span>Estado</span><select name="status"><option value="published" ${resource?.status !== 'draft' ? 'selected' : ''}>Publicado</option><option value="draft" ${resource?.status === 'draft' ? 'selected' : ''}>Borrador</option></select></label>
        <label><span>Carpeta lógica</span><input type="text" name="folder" value="${escapeHtml(resource?.folder || 'general')}" placeholder="rrhh" /></label>
        <label style="grid-column:1 / -1"><span>Descripción</span><textarea name="description">${escapeHtml(resource?.description || '')}</textarea></label>
        <label style="grid-column:1 / -1"><span>URL externa / video / embed</span><input type="url" name="url" value="${escapeHtml(resource?.url || '')}" placeholder="https://..." /></label>
        <label style="grid-column:1 / -1"><span>Preview URL opcional</span><input type="url" name="preview_url" value="${escapeHtml(resource?.preview_url || '')}" placeholder="https://..." /></label>
        <label style="grid-column:1 / -1"><span>Subir archivo</span><div class="file-input-wrap"><input type="file" name="file" /></div></label>
        ${resource?.storage_path ? `
          <label><span>Ruta actual</span><input type="text" value="${escapeHtml(resource.storage_path)}" disabled /></label>
          <label><span>Mover a carpeta</span><input type="text" name="move_folder" value="${escapeHtml(resource.folder || '')}" placeholder="nueva-carpeta" /></label>
        ` : ''}
        <div style="grid-column:1 / -1" class="callout info">
          <strong>Tipos recomendados</strong>
          <span><strong>file</strong> para PDFs y documentos, <strong>video</strong> para YouTube/Vimeo, <strong>link</strong> para páginas externas, <strong>image</strong> para imágenes, <strong>embed</strong> solo cuando realmente necesites un iframe. El embed indiscriminado es una invitación elegante al caos.</span>
        </div>
        <div style="grid-column:1 / -1" class="quick-actions"><button class="btn primary" type="submit">Guardar recurso</button></div>
      </form>
    `,
  });

  document.getElementById('resource-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const file = form.get('file');
    const kind = form.get('kind');

    let storagePath = resource?.storage_path || null;
    let mimeType = resource?.mime_type || null;
    let sizeBytes = resource?.size_bytes || null;

    if (file && typeof file.name === 'string' && file.size > 0) {
      const folder = slugify(form.get('folder') || 'general') || 'general';
      const fileName = `${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ''))}.${file.name.split('.').pop()}`;
      storagePath = `${folder}/${fileName}`;
      mimeType = file.type || null;
      sizeBytes = file.size || null;
      const { error: uploadError } = await supabase.storage.from(CONFIG.STORAGE_BUCKET).upload(storagePath, file, { upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;
    } else if (resource?.storage_path && form.get('move_folder') && form.get('move_folder').trim() !== (resource.folder || '')) {
      const newFolder = slugify(form.get('move_folder')) || 'general';
      const fileName = resource.storage_path.split('/').pop();
      const nextPath = `${newFolder}/${fileName}`;
      const { error: moveError } = await supabase.storage.from(CONFIG.STORAGE_BUCKET).move(resource.storage_path, nextPath);
      if (moveError) throw moveError;
      storagePath = nextPath;
    }

    const payload = {
      title: form.get('title').trim(),
      kind,
      space_id: form.get('space_id') || null,
      linked_page_id: form.get('linked_page_id') || null,
      status: form.get('status'),
      folder: slugify(form.get('folder') || 'general') || 'general',
      description: form.get('description').trim(),
      url: form.get('url').trim() || null,
      preview_url: form.get('preview_url').trim() || null,
      storage_bucket: storagePath ? CONFIG.STORAGE_BUCKET : null,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      updated_by: state.user.id,
    };

    if (resource) payload.id = resource.id;
    else payload.created_by = state.user.id;

    await upsertRecord('resources', payload, resource ? 'Recurso actualizado.' : 'Recurso creado.');
    closeModal();
  });
}

function openBrandingForm() {
  const branding = state.settings.branding || {};
  openModal({
    title: 'Editar branding',
    kicker: 'Branding',
    content: `
      <form id="branding-form" class="form-grid two">
        <label><span>Nombre de la app</span><input type="text" name="app_name" value="${escapeHtml(branding.app_name || CONFIG.APP_NAME || 'Clean It Wiki')}" /></label>
        <label><span>Tagline</span><input type="text" name="tagline" value="${escapeHtml(branding.tagline || CONFIG.APP_TAGLINE || '')}" /></label>
        <label><span>Color primario</span><input type="color" name="primary_color" value="${escapeHtml(branding.primary_color || CONFIG.DEFAULT_PRIMARY_COLOR || '#1f6feb')}" /></label>
        <label><span>Texto del logo</span><input type="text" name="logo_text" maxlength="3" value="${escapeHtml(branding.logo_text || 'CI')}" /></label>
        <label style="grid-column:1 / -1"><span>Título de portada</span><input type="text" name="home_title" value="${escapeHtml(branding.home_title || '')}" /></label>
        <label style="grid-column:1 / -1"><span>Texto de portada</span><textarea name="home_copy">${escapeHtml(branding.home_copy || '')}</textarea></label>
        <div style="grid-column:1 / -1" class="quick-actions"><button class="btn primary" type="submit">Guardar branding</button></div>
      </form>
    `,
  });

  document.getElementById('branding-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      app_name: form.get('app_name').trim(),
      tagline: form.get('tagline').trim(),
      primary_color: form.get('primary_color').trim(),
      logo_text: form.get('logo_text').trim() || 'CI',
      home_title: form.get('home_title').trim(),
      home_copy: form.get('home_copy').trim(),
    };

    const { error } = await supabase.from('app_settings').upsert({ key: 'branding', value: payload, updated_by: state.user.id }, { onConflict: 'key' });
    if (error) throw error;
    notify('Branding actualizado.', 'success');
    await reloadWorkspace();
    closeModal();
  });
}

function openAccountModal() {
  const profile = state.profile;
  openModal({
    title: 'Mi cuenta',
    kicker: 'Perfil',
    content: `
      <div class="tabs compact">
        <button class="tab active" data-account-tab="profile">Perfil</button>
        <button class="tab" data-account-tab="security">Seguridad</button>
      </div>
      <section id="account-profile" class="account-card card">
        <form id="account-profile-form" class="form-grid two">
          <label><span>Nombre completo</span><input type="text" name="full_name" value="${escapeHtml(profile?.full_name || '')}" required /></label>
          <label><span>Email</span><input type="email" value="${escapeHtml(profile?.email || state.user.email || '')}" disabled /></label>
          <label><span>Área</span><input type="text" name="department" value="${escapeHtml(profile?.department || '')}" /></label>
          <label><span>Puesto</span><input type="text" name="job_title" value="${escapeHtml(profile?.job_title || '')}" /></label>
          <div style="grid-column:1 / -1" class="quick-actions"><button class="btn primary" type="submit">Guardar perfil</button></div>
        </form>
      </section>
      <section id="account-security" class="account-card card hidden">
        <form id="account-security-form" class="form-grid">
          <label><span>Nueva contraseña</span><input type="password" name="password" minlength="8" required /></label>
          <label><span>Confirmar contraseña</span><input type="password" name="password_confirm" minlength="8" required /></label>
          <div class="quick-actions"><button class="btn primary" type="submit">Cambiar contraseña</button></div>
        </form>
      </section>
    `,
  });

  document.querySelectorAll('[data-account-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-account-tab]').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      document.getElementById('account-profile').classList.toggle('hidden', button.dataset.accountTab !== 'profile');
      document.getElementById('account-security').classList.toggle('hidden', button.dataset.accountTab !== 'security');
    });
  });

  document.getElementById('account-profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.rpc('update_my_profile', {
      p_full_name: form.get('full_name').trim(),
      p_department: form.get('department').trim(),
      p_job_title: form.get('job_title').trim(),
    });
    if (error) throw error;
    notify('Perfil actualizado.', 'success');
    await reloadWorkspace();
    closeModal();
  });

  document.getElementById('account-security-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    const passwordConfirm = form.get('password_confirm');
    if (password !== passwordConfirm) {
      notify('Las contraseñas no coinciden.', 'error');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    notify('Contraseña actualizada.', 'success');
    closeModal();
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  clearAuthMessage();
  const { error } = await supabase.auth.signInWithPassword({ email: form.get('email').trim(), password: form.get('password') });
  if (error) return showAuthMessage(error.message, 'error');
  showAuthMessage('Ingreso correcto.', 'success');
}

async function handleSignup(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  clearAuthMessage();
  const password = form.get('password');
  const passwordConfirm = form.get('password_confirm');
  if (password !== passwordConfirm) {
    return showAuthMessage('Las contraseñas no coinciden.', 'error');
  }

  const email = form.get('email').trim();
  const fullName = form.get('full_name').trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) return showAuthMessage(error.message, 'error');
  if (data.session) {
    showAuthMessage('Cuenta creada y sesión iniciada.', 'success');
  } else {
    showAuthMessage('Cuenta creada. Revisá tu correo para confirmar el alta.', 'success');
    switchAuthTab('login');
  }
}

async function handleRecoverPassword(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  clearAuthMessage();
  const redirectTo = CONFIG.RECOVERY_REDIRECT_URL || `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabase.auth.resetPasswordForEmail(form.get('email').trim(), { redirectTo });
  if (error) return showAuthMessage(error.message, 'error');
  showAuthMessage('Email de recuperación enviado.', 'success');
}

async function handlePasswordReset(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const password = form.get('password');
  const passwordConfirm = form.get('password_confirm');
  if (password !== passwordConfirm) return showAuthMessage('Las contraseñas no coinciden.', 'error');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return showAuthMessage(error.message, 'error');
  state.isPasswordRecovery = false;
  showAuthMessage('Contraseña actualizada. Ya podés ingresar.', 'success');
  switchAuthTab('login');
}

function openPasswordRecoveryForm() {
  els.authScreen.classList.remove('hidden');
  els.appShell.classList.add('hidden');
  switchAuthTab('recover');
  document.getElementById('recover-form').classList.add('hidden');
  document.getElementById('password-reset-form').classList.remove('hidden');
}

async function handleLogout() {
  await supabase.auth.signOut();
  closeSidebar();
}

async function bootstrapFirstAdmin() {
  try {
    const { error } = await supabase.rpc('bootstrap_first_admin');
    if (error) throw error;
    notify('Tu usuario ahora es administrador.', 'success');
    await reloadWorkspace();
    setRoute({ view: 'admin', tab: 'content' });
  } catch (error) {
    notify(error.message || 'No se pudo reclamar el rol admin.', 'error');
  }
}

async function saveUserRow(userId) {
  const role = document.querySelector(`[data-user-role="${userId}"]`)?.value;
  const department = document.querySelector(`[data-user-department="${userId}"]`)?.value?.trim() || null;
  const isActive = document.querySelector(`[data-user-active="${userId}"]`)?.classList.contains('active');
  const { error } = await supabase.from('profiles').update({ role, department, is_active: isActive }).eq('id', userId);
  if (error) return handleError(error);
  notify('Usuario actualizado.', 'success');
  await reloadWorkspace();
}

async function upsertRecord(table, payload, successMessage) {
  const { error } = await supabase.from(table).upsert(payload).select().single();
  if (error) throw error;
  notify(successMessage, 'success');
  await reloadWorkspace();
}

async function deleteRecord(table, id, successMessage) {
  if (!window.confirm('Esta acción no se puede deshacer. ¿Continuar?')) return;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return handleError(error);
  notify(successMessage, 'success');
  await reloadWorkspace();
}

async function deleteResource(id) {
  if (!window.confirm('Se eliminará el recurso y su archivo asociado si existe. ¿Continuar?')) return;
  const resource = state.resources.find((item) => item.id === id);
  if (!resource) return;
  if (resource.storage_path) {
    const { error: storageError } = await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove([resource.storage_path]);
    if (storageError) return handleError(storageError);
  }
  const { error } = await supabase.from('resources').delete().eq('id', id);
  if (error) return handleError(error);
  notify('Recurso eliminado.', 'success');
  await reloadWorkspace();
}

async function reloadWorkspace() {
  await loadWorkspace();
  renderUserBadge();
  renderSidebarTree();
  renderRoute();
}

async function resolveResourceUrl(resource, forceRefresh = false) {
  if (!resource) return null;

  if ((resource.kind === 'link' || resource.kind === 'video' || resource.kind === 'embed' || resource.kind === 'image') && resource.url) {
    return normalizeExternalUrl(resource);
  }

  if (!resource.storage_path) return null;

  const cacheKey = resource.storage_path;
  if (!forceRefresh && state.resourceUrlCache.has(cacheKey)) return state.resourceUrlCache.get(cacheKey);

  const { data, error } = await supabase.storage.from(resource.storage_bucket || CONFIG.STORAGE_BUCKET).createSignedUrl(resource.storage_path, 3600);
  if (error) {
    handleError(error);
    return null;
  }

  state.resourceUrlCache.set(cacheKey, data.signedUrl);
  return data.signedUrl;
}

function visiblePages() {
  return state.pages.filter((page) => page.status === 'published' || state.profile?.role === 'admin');
}

function visibleResources() {
  return state.resources.filter((resource) => resource.status === 'published' || state.profile?.role === 'admin');
}

function firstPublishedPage() {
  return visiblePages()[0] || null;
}

function firstPageForSpace(spaceId) {
  return visiblePages().find((page) => page.space_id === spaceId) || null;
}

function resourceIcon(resource) {
  const map = { file: '📎', link: '🔗', video: '🎬', image: '🖼️', embed: '🧩' };
  return map[resource.kind] || '📎';
}

function spaceName(spaceId) {
  return state.spaces.find((item) => item.id === spaceId)?.name || '—';
}

function renderMarkdown(markdown) {
  const source = markdown || '';
  const rawHtml = window.marked?.parse ? window.marked.parse(source) : `<p>${escapeHtml(source).replace(/\n/g, '<br>')}</p>`;
  return window.DOMPurify?.sanitize ? window.DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }) : rawHtml;
}

function renderMarkdownWithToc(markdown) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderMarkdown(markdown);
  const toc = [];
  const slugCounts = new Map();

  wrapper.querySelectorAll('h2, h3').forEach((heading) => {
    const base = slugify(heading.textContent || 'section') || 'section';
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    const id = count ? `${base}-${count + 1}` : base;
    heading.id = id;
    toc.push({ id, text: heading.textContent || 'Sección' });
  });

  return { html: wrapper.innerHTML, toc };
}

function normalizeExternalUrl(resource) {
  const url = resource.url;
  if (!url) return null;
  if (resource.kind === 'video') {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtube.com')) {
        const videoId = parsed.searchParams.get('v');
        return videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
      }
      if (parsed.hostname.includes('youtu.be')) {
        const videoId = parsed.pathname.replace('/', '');
        return videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
      }
    } catch (_) {
      return url;
    }
  }
  return url;
}

function showAuthMessage(message, type = 'success') {
  els.authMessage.className = `feedback ${type}`;
  els.authMessage.textContent = message;
  els.authMessage.classList.remove('hidden');
}

function clearAuthMessage() {
  els.authMessage.textContent = '';
  els.authMessage.className = 'feedback hidden';
}

function switchAuthTab(tab) {
  document.querySelectorAll('[data-auth-tab]').forEach((button) => button.classList.toggle('active', button.dataset.authTab === tab));
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('signup-form').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('recover-form').classList.toggle('hidden', tab !== 'recover');
  document.getElementById('password-reset-form').classList.add('hidden');
}

function openSidebar() {
  document.body.classList.add('sidebar-open');
}

function closeSidebar() {
  document.body.classList.remove('sidebar-open');
}

function notify(message, type = 'success') {
  const existing = document.querySelector('.toast-stack');
  const stack = existing || Object.assign(document.createElement('div'), { className: 'toast-stack' });
  if (!existing) {
    stack.style.position = 'fixed';
    stack.style.right = '16px';
    stack.style.bottom = '16px';
    stack.style.display = 'grid';
    stack.style.gap = '10px';
    stack.style.zIndex = '1000';
    document.body.appendChild(stack);
  }
  const item = document.createElement('div');
  item.className = `feedback ${type}`;
  item.textContent = message;
  item.style.minWidth = '260px';
  item.style.boxShadow = '0 18px 36px rgba(11,18,32,.18)';
  stack.appendChild(item);
  setTimeout(() => item.remove(), 3600);
}

function handleError(error) {
  console.error(error);
  const message = error?.message || 'Ocurrió un error inesperado.';
  if (state.user) notify(message, 'error');
  else showAuthMessage(message, 'error');
}

function renderEmptyBlock(title, text) {
  return `
    <article class="empty-state card">
      <h3>${escapeHtml(title)}</h3>
      <p class="muted">${escapeHtml(text)}</p>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function summarize(text, maxLength = 140) {
  const clean = String(text || '').replace(/[#>*`\[\]()_-]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength).trim()}…` : clean;
}

function getInitials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function insertAtCursor(textarea, snippet) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  textarea.value = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
  textarea.focus();
  const nextPosition = start + snippet.length;
  textarea.setSelectionRange(nextPosition, nextPosition);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function hexToRgba(hex, alpha = 1) {
  const clean = (hex || '#1f6feb').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean;
  const number = parseInt(full, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
