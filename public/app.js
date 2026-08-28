const state = { token: localStorage.getItem('farmweather_token'), user: null, plots: [], crops: [], selectedPlotId: null, authMode: 'login', map: null, marker: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (response.status === 401 && state.token) clearSession();
  if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `เกิดข้อผิดพลาด (${response.status})`);
  return body;
}

function clearSession() {
  state.token = null; state.user = null; state.plots = []; state.crops = []; state.selectedPlotId = null;
  localStorage.removeItem('farmweather_token');
  if ($('#plot-modal')?.open) $('#plot-modal').close();
  $('#app-shell').classList.add('hidden'); $('#auth-screen').classList.remove('hidden');
  setAuthMode('login');
}

function toast(message, error = false) {
  const node = $('#toast'); node.textContent = message;
  node.className = `pointer-events-none fixed right-4 top-4 z-[100] max-w-sm rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${error ? 'bg-red-600' : 'bg-slate-900'}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.add('hidden'), 4000);
}

function busy(button, active, label) { button.disabled = active; if (label) button.textContent = label; }
function esc(value) { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; }
function number(value) { return Number.isFinite(value) ? Math.round(value * 10) / 10 : '—'; }
function date(value) { return value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; }
function hour(value) { return new Intl.DateTimeFormat('th-TH', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function cropName(code) { return state.crops.find((crop) => crop.code === code)?.name || code; }
function selectedPlot() { return state.plots.find((plot) => plot.id === state.selectedPlotId); }

function setAuthMode(mode) {
  state.authMode = mode;
  $('#auth-form').classList.remove('hidden'); $('#forgot-form').classList.add('hidden'); $('#reset-form').classList.add('hidden'); $('#auth-tabs').classList.remove('hidden');
  const register = mode === 'register';
  $('#auth-title').textContent = register ? 'สร้างบัญชีใหม่' : 'เข้าสู่ระบบ';
  $('#auth-eyebrow').textContent = register ? 'เริ่มต้นใช้งาน' : 'ยินดีต้อนรับกลับ';
  $('#auth-description').textContent = register ? 'สร้างบัญชีเพื่อจัดการแปลงของคุณ' : 'เข้าสู่ระบบเพื่อดูแปลงและคำแนะนำของคุณ';
  $('#confirm-field').classList.toggle('hidden', !register); $('#confirm-field input').required = register;
  $('#auth-submit').textContent = register ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'; $('#forgot-link').classList.toggle('hidden', register);
  $$('.auth-tab').forEach((tab) => tab.className = `auth-tab rounded-lg px-3 py-2 text-sm font-semibold ${tab.dataset.authMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`);
  $('#auth-error').classList.add('hidden');
}

async function submitAuth(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries());
  if (state.authMode === 'register' && payload.password !== payload.confirmPassword) return showAuthError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
  delete payload.confirmPassword; const button = $('#auth-submit'); busy(button, true, 'กำลังดำเนินการ…');
  try { const result = await api(`/auth/${state.authMode}`, { method: 'POST', body: JSON.stringify(payload) }); state.token = result.token; localStorage.setItem('farmweather_token', result.token); await enterApp(result.user); }
  catch (error) { showAuthError(error.message); }
  finally { busy(button, false, state.authMode === 'register' ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'); }
}

function showAuthError(message) { $('#auth-error').textContent = message; $('#auth-error').classList.remove('hidden'); }

async function submitForgot(event) {
  event.preventDefault();
  try { const result = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); if (result.resetToken) { $('#reset-form [name=token]').value = result.resetToken; $('#forgot-form').classList.add('hidden'); $('#reset-form').classList.remove('hidden'); toast('สร้างรหัสรีเซ็ตแล้ว'); } else { setAuthMode('login'); toast('หากพบบัญชี ระบบได้ส่งขั้นตอนรีเซ็ตรหัสผ่านแล้ว'); } }
  catch (error) { toast(error.message, true); }
}

async function submitReset(event) {
  event.preventDefault();
  try { await api('/auth/reset-password', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); toast('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบ'); setAuthMode('login'); }
  catch (error) { toast(error.message, true); }
}

async function enterApp(user) {
  state.user = user;
  $('#sidebar-user').textContent = user.displayName || user.username; $('#sidebar-role').textContent = user.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'เกษตรกร';
  buildNavigation();
  await Promise.all([loadCrops(), loadProfile()]);
  if (user.role === 'ADMIN') { await showView('admin'); } else { await showView('farmer'); }
  $('#auth-screen').classList.add('hidden'); $('#app-shell').classList.remove('hidden');
}

function buildNavigation() {
  const items = state.user.role === 'ADMIN'
    ? [{ id: 'admin', label: 'จัดการผู้ใช้', icon: '◫' }, { id: 'profile', label: 'ข้อมูลส่วนตัว', icon: '○' }]
    : [{ id: 'farmer', label: 'แปลงของฉัน', icon: '⌂' }, { id: 'profile', label: 'ข้อมูลส่วนตัว', icon: '○' }];
  $('#desktop-nav').innerHTML = items.map((item) => `<button class="nav-btn" data-view-target="${item.id}"><span>${item.icon}</span>${item.label}</button>`).join('');
  $('#mobile-nav').innerHTML = items.map((item) => `<button class="mobile-nav-btn" data-view-target="${item.id}"><span class="block text-base">${item.icon}</span>${item.label}</button>`).join('');
  $$('[data-view-target]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.viewTarget)));
}

async function showView(name) {
  $$('[data-view]').forEach((view) => view.classList.toggle('hidden', view.id !== `${name}-view`));
  $$('[data-view-target]').forEach((button) => button.classList.toggle('active', button.dataset.viewTarget === name));
  const titles = { farmer: ['แปลงของฉัน', 'อากาศและคำแนะนำตามพิกัด'], admin: ['จัดการผู้ใช้', 'สิทธิ์และบัญชีในระบบ'], profile: ['ข้อมูลส่วนตัว', 'ข้อมูลบัญชีของคุณ'] };
  $('#page-title').textContent = titles[name][0]; $('#page-subtitle').textContent = titles[name][1];
  try { if (name === 'farmer') await loadPlots(); if (name === 'admin') await loadUsers(); if (name === 'profile') await loadProfile(); }
  catch (error) { toast(error.message, true); }
}

async function logout() { try { await api('/auth/logout', { method: 'POST' }); } catch (_) {} clearSession(); }

async function loadProfile() {
  const profile = await api('/profile'); state.user = { ...state.user, ...profile };
  $('#profile-username').value = profile.username; $('#profile-role').value = profile.role;
  $('#profile-form [name=displayName]').value = profile.displayName || ''; $('#profile-form [name=phone]').value = profile.phone || ''; $('#profile-form [name=province]').value = profile.province || '';
  $('#sidebar-user').textContent = profile.displayName || profile.username;
}

async function saveProfile(event) {
  event.preventDefault();
  try { const profile = await api('/profile', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); state.user = { ...state.user, ...profile }; $('#sidebar-user').textContent = profile.displayName || profile.username; toast('บันทึกข้อมูลส่วนตัวแล้ว'); }
  catch (error) { toast(error.message, true); }
}

async function loadUsers() {
  const users = await api('/admin/users');
  $('#admin-total').textContent = users.length; $('#admin-farmers').textContent = users.filter((u) => u.role === 'FARMER').length; $('#admin-admins').textContent = users.filter((u) => u.role === 'ADMIN').length;
  $('#users-table').innerHTML = users.length ? users.map((user) => `<tr><td class="px-5 py-4"><strong class="block">${esc(user.displayName || user.username)}</strong><span class="text-xs text-slate-500">@${esc(user.username)}</span></td><td class="px-5 py-4 text-slate-600">${esc(user.phone || '—')}</td><td class="px-5 py-4 text-slate-600">${esc(user.province || '—')}</td><td class="px-5 py-4"><select data-role-user="${user.id}" class="field !w-auto !py-2" ${user.id === state.user.id ? 'disabled title="เปลี่ยน role ของตัวเองไม่ได้"' : ''}><option value="FARMER" ${user.role === 'FARMER' ? 'selected' : ''}>FARMER</option><option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option></select></td></tr>`).join('') : '<tr><td colspan="4" class="p-8 text-center text-slate-500">ยังไม่มีผู้ใช้</td></tr>';
  $$('[data-role-user]').forEach((select) => select.addEventListener('change', async () => { try { await api(`/admin/users/${select.dataset.roleUser}/role`, { method: 'PATCH', body: JSON.stringify({ role: select.value }) }); toast('เปลี่ยนสิทธิ์ผู้ใช้แล้ว'); await loadUsers(); } catch (error) { toast(error.message, true); await loadUsers(); } }));
}

async function loadCrops() { state.crops = await api('/crops'); $('#plot-form [name=cropType]').innerHTML = '<option value="">เลือกชนิดพืช</option>' + state.crops.map((crop) => `<option value="${crop.code}">${esc(crop.name)}</option>`).join(''); }

async function loadPlots() {
  state.plots = await api('/plots'); $('#plot-count').textContent = state.plots.length;
  $('#farmer-empty').classList.toggle('hidden', state.plots.length > 0); $('#farmer-content').classList.toggle('hidden', state.plots.length === 0);
  if (!state.plots.some((plot) => plot.id === state.selectedPlotId)) state.selectedPlotId = state.plots[0]?.id || null;
  renderPlotList(); if (state.selectedPlotId) await selectPlot(state.selectedPlotId, false);
}

function renderPlotList() {
  $('#plot-list').innerHTML = state.plots.map((plot) => `<button class="plot-item ${plot.id === state.selectedPlotId ? 'active' : ''}" data-plot="${plot.id}"><div class="flex items-center justify-between gap-2"><strong class="truncate">${esc(plot.name)}</strong><span class="size-2 rounded-full ${plot.active ? 'bg-green-500' : 'bg-slate-300'}"></span></div><p class="mt-1 text-xs text-slate-500">${esc(cropName(plot.cropType))} · ${esc(plot.province || 'ไม่ระบุจังหวัด')}</p></button>`).join('');
  $$('[data-plot]').forEach((button) => button.addEventListener('click', () => selectPlot(button.dataset.plot)));
}

async function selectPlot(id, load = true) {
  state.selectedPlotId = id; const plot = selectedPlot(); renderPlotList();
  $('#selected-name').textContent = plot.name; $('#selected-meta').textContent = `${cropName(plot.cropType)} · ${plot.province || 'ไม่ระบุจังหวัด'} · ${plot.latitude.toFixed(4)}, ${plot.longitude.toFixed(4)}`;
  $('#toggle-plot').textContent = plot.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'; $('#toggle-plot').classList.toggle('!border-green-300', !plot.active);
  resetWeather(); if (load) await Promise.allSettled([loadCurrent(), loadForecast(), loadAnalysis(), loadNotifications()]); else await Promise.allSettled([loadCurrent(), loadForecast(), loadAnalysis(), loadNotifications()]);
}

function resetWeather() { ['temperature','rain','humidity','wind'].forEach((id) => $(`#${id}`).textContent = '—'); $('#observation-meta').textContent = 'กำลังโหลดข้อมูล…'; $('#forecast-list').innerHTML = '<p class="text-sm text-slate-500">กำลังโหลดพยากรณ์…</p>'; $('#analysis-content').textContent = 'กดวิเคราะห์เพื่อดูคำแนะนำตามชนิดและระยะพืช'; $('#risk-badge').className = 'badge bg-slate-100 text-slate-600'; $('#risk-badge').textContent = 'รอวิเคราะห์'; }

async function loadCurrent(force = false) { try { const data = await api(`/plots/${state.selectedPlotId}/weather/${force ? 'current/refresh' : 'current'}`, force ? { method: 'POST' } : {}); $('#temperature').textContent = number(data.temperatureC); $('#rain').textContent = number(data.rainfallMm); $('#humidity').textContent = number(data.relativeHumidityPct); $('#wind').textContent = number(data.windSpeedMs); $('#observation-meta').textContent = `${data.stationName} · ห่าง ${number(data.stationDistanceKm)} กม. · ${date(data.observedAt)}`; } catch (error) { $('#observation-meta').textContent = `โหลดไม่ได้: ${error.message}`; } }

async function loadForecast(force = false) { const items = await api(`/plots/${state.selectedPlotId}/weather/${force ? 'refresh' : 'hourly'}`, force ? { method: 'POST' } : {}); const upcoming = items.filter((x) => new Date(x.forecastAt).getTime() >= Date.now()).slice(0, 24); $('#forecast-updated').textContent = upcoming[0] ? `อัปเดต ${date(upcoming[0].fetchedAt)}` : 'ไม่มีพยากรณ์ในอนาคต'; $('#forecast-list').innerHTML = upcoming.length ? upcoming.map((x) => `<article class="forecast-item"><time class="text-xs text-slate-500">${hour(x.forecastAt)}</time><div class="my-2 text-2xl">${weatherIcon(x.conditionCode)}</div><strong>${number(x.temperatureC)}°</strong><p class="mt-1 text-xs text-slate-500">ฝน ${number(x.rainMm)} มม.</p></article>`).join('') : '<p class="text-sm text-slate-500">ยังไม่มีข้อมูล กรุณากดอัปเดต TMD</p>'; }
function weatherIcon(code) { if ([5,6,7].includes(code)) return '🌧️'; if (code === 8) return '⛈️'; if ([1,12].includes(code)) return '☀️'; return '⛅'; }

async function refreshWeather() { const button = $('#refresh-weather'); busy(button, true, 'กำลังอัปเดต…'); try { await Promise.all([loadCurrent(true), loadForecast(true)]); toast('อัปเดตข้อมูล TMD แล้ว'); } catch (error) { toast(error.message, true); } finally { busy(button, false, 'อัปเดตข้อมูล TMD'); } }

async function runAnalysis() { const button = $('#run-analysis'); busy(button, true, 'กำลังวิเคราะห์…'); try { const results = await api(`/plots/${state.selectedPlotId}/analysis/run`, { method: 'POST' }); renderAnalysis(results); await loadNotifications(); toast('วิเคราะห์ความเสี่ยงแล้ว'); } catch (error) { toast(error.message, true); } finally { busy(button, false, 'วิเคราะห์ความเสี่ยง'); } }
async function loadAnalysis() { try { renderAnalysis(await api(`/plots/${state.selectedPlotId}/analysis`)); } catch (_) {} }
function renderAnalysis(results) { if (!results.length) return; const rank = { LOW: 1, MEDIUM: 2, HIGH: 3 }; const top = [...results].sort((a,b) => rank[b.riskLevel]-rank[a.riskLevel])[0]; const labels = { LOW:'ความเสี่ยงต่ำ',MEDIUM:'ความเสี่ยงปานกลาง',HIGH:'ความเสี่ยงสูง' }; const stages = {SEEDLING:'ต้นกล้า',VEGETATIVE:'เจริญทางลำต้น',REPRODUCTIVE:'ออกดอก/ติดผล',MATURITY:'สุกแก่'}; $('#risk-badge').textContent = labels[top.riskLevel]; $('#risk-badge').className = `badge ${top.riskLevel === 'HIGH' ? 'bg-red-50 text-red-700' : top.riskLevel === 'MEDIUM' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`; const advice = [...new Set(results.flatMap((x) => x.recommendations))]; $('#analysis-content').innerHTML = `<p class="mb-3 text-xs font-semibold text-slate-500">ระยะพืช: ${stages[top.growthStage] || top.growthStage}</p><ul class="space-y-2">${advice.map((x) => `<li class="flex gap-2"><span class="text-brand-600">✓</span><span>${esc(x)}</span></li>`).join('')}</ul>`; }

async function loadNotifications() { const items = await api(`/plots/${state.selectedPlotId}/notifications`); const unread = items.filter((x) => x.status === 'PENDING'); $('#notification-count').textContent = unread.length; $('#notification-list').innerHTML = items.length ? items.slice(-5).reverse().map((x) => `<article class="notification-item ${x.severity === 'HIGH' ? 'high' : ''}"><div class="flex justify-between gap-3"><strong class="text-sm">${esc(x.title)}</strong>${x.status === 'PENDING' ? `<button data-read="${x.id}" class="shrink-0 text-xs font-semibold text-brand-700">ทำเครื่องหมายว่าอ่านแล้ว</button>` : '<span class="text-xs text-slate-400">อ่านแล้ว</span>'}</div><p class="mt-1 text-xs text-slate-600">${esc(x.message)}</p></article>`).join('') : '<p class="text-sm text-slate-500">ยังไม่มีการแจ้งเตือน</p>'; $$('[data-read]').forEach((button) => button.addEventListener('click', async () => { try { await api(`/notifications/${button.dataset.read}/read`, { method:'PATCH' }); await loadNotifications(); } catch (error) { toast(error.message,true); } })); }

function initMap() { if (!window.L) return toast('ไม่สามารถโหลดแผนที่ได้', true); if (!state.map) { state.map = L.map('plot-map').setView([13.7563,100.5018],6); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(state.map); state.map.on('click',(e)=>setPosition(e.latlng.lat,e.latlng.lng)); } setTimeout(()=>state.map.invalidateSize(),100); }
function setPosition(lat,lng,zoom=false) { if (!state.marker) state.marker=L.marker([lat,lng],{draggable:true}).addTo(state.map); else state.marker.setLatLng([lat,lng]); state.marker.off('dragend').on('dragend',()=>{const p=state.marker.getLatLng();setPosition(p.lat,p.lng)}); $('#plot-form [name=latitude]').value=lat; $('#plot-form [name=longitude]').value=lng; $('#coordinate-text').textContent=`พิกัด ${lat.toFixed(6)}, ${lng.toFixed(6)}`; if(zoom)state.map.setView([lat,lng],16); }
function openPlotModal(plot = null) { const form=$('#plot-form'); form.reset(); form.elements.id.value=plot?.id||''; $('#plot-modal-title').textContent=plot?'แก้ไขแปลงเพาะปลูก':'เพิ่มแปลงเพาะปลูก'; $('#plot-modal').showModal(); initMap(); if(plot){form.elements.name.value=plot.name;form.elements.cropType.value=plot.cropType;form.elements.plantedAt.value=plot.plantedAt;form.elements.province.value=plot.province||'';setPosition(plot.latitude,plot.longitude,true)}else if(state.marker){state.map.removeLayer(state.marker);state.marker=null;$('#coordinate-text').textContent='คลิกบนแผนที่เพื่อเลือกตำแหน่ง';} }
async function savePlot(event) { event.preventDefault(); const data=Object.fromEntries(new FormData(event.currentTarget));const id=data.id;delete data.id;data.latitude=Number(data.latitude);data.longitude=Number(data.longitude);if(!Number.isFinite(data.latitude)||!Number.isFinite(data.longitude))return toast('กรุณาเลือกตำแหน่งแปลงบนแผนที่',true);try{const plot=await api(id?`/plots/${id}`:'/plots',{method:id?'PATCH':'POST',body:JSON.stringify(data)});state.selectedPlotId=plot.id;$('#plot-modal').close();await loadPlots();toast(id?'แก้ไขแปลงแล้ว':'เพิ่มแปลงแล้ว');}catch(error){toast(error.message,true)} }
async function togglePlot(){const plot=selectedPlot();try{await api(`/plots/${plot.id}/active`,{method:'PATCH',body:JSON.stringify({active:!plot.active})});await loadPlots();toast(plot.active?'ปิดใช้งานแปลงแล้ว':'เปิดใช้งานแปลงแล้ว')}catch(error){toast(error.message,true)}}
async function deletePlot(){const plot=selectedPlot();if(!confirm(`ลบ “${plot.name}” และประวัติทั้งหมดใช่หรือไม่? การดำเนินการนี้ย้อนกลับไม่ได้`))return;try{await api(`/plots/${plot.id}`,{method:'DELETE'});state.selectedPlotId=null;await loadPlots();toast('ลบแปลงแล้ว')}catch(error){toast(error.message,true)}}

$$('[data-auth-mode]').forEach((b)=>b.addEventListener('click',()=>setAuthMode(b.dataset.authMode))); $$('[data-back-login]').forEach((b)=>b.addEventListener('click',()=>setAuthMode('login')));
$('#auth-form').addEventListener('submit',submitAuth); $('#forgot-form').addEventListener('submit',submitForgot); $('#reset-form').addEventListener('submit',submitReset); $('#forgot-link').addEventListener('click',()=>{$('#auth-form').classList.add('hidden');$('#auth-tabs').classList.add('hidden');$('#forgot-form').classList.remove('hidden');$('#auth-title').textContent='ลืมรหัสผ่าน';$('#auth-description').textContent='กรอกชื่อผู้ใช้เพื่อสร้างรหัสรีเซ็ต'});
$$('[data-logout]').forEach((b)=>b.addEventListener('click',logout)); $('#profile-form').addEventListener('submit',saveProfile); $('#add-plot').addEventListener('click',()=>openPlotModal()); $('#empty-add-plot').addEventListener('click',()=>openPlotModal()); $('#edit-plot').addEventListener('click',()=>openPlotModal(selectedPlot())); $('#toggle-plot').addEventListener('click',togglePlot); $('#delete-plot').addEventListener('click',deletePlot); $('#close-plot-modal').addEventListener('click',()=>$('#plot-modal').close()); $('#cancel-plot').addEventListener('click',()=>$('#plot-modal').close()); $('#plot-form').addEventListener('submit',savePlot); $('#locate-button').addEventListener('click',()=>navigator.geolocation?.getCurrentPosition((p)=>setPosition(p.coords.latitude,p.coords.longitude,true),()=>toast('ไม่สามารถอ่านตำแหน่งได้',true))); $('#refresh-weather').addEventListener('click',refreshWeather); $('#run-analysis').addEventListener('click',runAnalysis);

setAuthMode('login');
if(state.token) api('/auth/me').then(enterApp).catch(()=>clearSession());
