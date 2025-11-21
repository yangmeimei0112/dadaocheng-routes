// 匯入 Supabase 的 createClient 函式
import { createClient } from '@supabase/supabase-js';

// 1. 初始化 Supabase 客戶端
// [!! 修改 !!] 改為從環境變數讀取，避免寫死導致錯誤或外洩
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 檢查是否成功讀取到環境變數
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('錯誤：找不到 Supabase 環境變數。請檢查 .env 檔案或 Vercel 設定。');
    // 如果是在本地，alert 提醒一下
    if (location.hostname === 'localhost') {
        alert('錯誤：請在 .env 檔案中設定 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
    }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. 取得 HTML 元素
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const loadingIndicator = document.getElementById('loading');
const routesContainer = document.getElementById('routes-container');

// 頁面區塊元素
const listView = document.getElementById('list-view');
const detailView = document.getElementById('detail-view');
const mapContainer = document.getElementById('map');
const detailContentWrapper = document.getElementById('detail-content-wrapper');

// 3. Google Maps API 載入邏輯
// ===================================

function loadGoogleMapsAPI() {
    return new Promise((resolve, reject) => {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

        if (!apiKey) {
            console.error('找不到 Google Maps API 金鑰');
            mapContainer.innerHTML = '無法載入地圖：缺少 API 金鑰設定。';
            reject(new Error('Missing API Key'));
            return;
        }

        const script = document.createElement('script');
        // [!! 修改 !!] 加入 &loading=async 以解決黃色警告
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&loading=async&callback=initMapCallback`;
        script.async = true;
        script.defer = true;

        window.initMapCallback = () => {
            console.log('Google Maps API 載入成功。');
            resolve();
        };

        script.onerror = () => {
            console.error('載入 Google Maps API 失敗。');
            mapContainer.innerHTML = '無法載入地圖。請檢查您的 API 金鑰或網路連線。';
            reject(new Error('Failed to load Google Maps script'));
        };

        document.head.appendChild(script);
    });
}


// 4. 頁面切換 (路由) 邏輯
// ===================================

function showView(viewId) {
    listView.style.display = 'none';
    detailView.style.display = 'none';

    const viewToShow = document.getElementById(viewId);
    if (viewToShow) {
        viewToShow.style.display = 'block';
        window.scrollTo(0, 0);
    }
}

async function handleHashChange() {
    const hash = window.location.hash; 

    if (hash.startsWith('#route=')) {
        const routeId = hash.split('=')[1];
        showView('detail-view');
        await fetchRouteDetails(routeId);
    } else {
        showView('list-view');
        if (searchInput.value) {
            await searchRoutes();
        } 
        else if (routesContainer.children.length === 0) {
            await fetchAllRoutes();
        }
    }
}

// 5. 列表頁邏輯 (抓取 + 顯示)
// ===================================

async function fetchAllRoutes() {
    console.log("正在讀取所有路線 (簡易)...");
    loadingIndicator.style.display = 'block';
    routesContainer.innerHTML = '';
    searchInput.value = ''; 

    const query = 'id, name, description, tags, total_duration_estimate'; 

    try {
        const { data, error } = await supabase
            .from('routes')
            .select(query)
            .order('id');

        if (error) {
            console.error('查詢失敗:', error);
            // 這裡會顯示更詳細的錯誤
            alert('無法讀取資料：' + error.message);
            return;
        }
        
        displayRouteList(data);

    } catch (err) {
        // 這裡會捕捉 ERR_NAME_NOT_RESOLVED 等網路錯誤
        console.error('發生錯誤 (可能是連線問題):', err);
        alert('連線發生錯誤，請檢查網路或 Supabase 狀態。');
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

async function searchRoutes() {
    const searchTerm = searchInput.value.trim();
    if (searchTerm === '') {
        await fetchAllRoutes(); 
        return;
    }

    console.log(`正在搜尋多關鍵字: ${searchTerm}`);
    loadingIndicator.style.display = 'block';
    routesContainer.innerHTML = '';

    try {
        const { data: routesData, error: rpcError } = await supabase
            .rpc('search_routes_multi_tag', {
                search_terms: searchTerm 
            });

        if (rpcError) throw rpcError;

        if (routesData.length === 0) {
            displayRouteList([]);
            return;
        }
        
        const routeIds = routesData.map(r => r.id);
        
        const { data, error } = await supabase
            .from('routes')
            .select('id, name, description, tags, total_duration_estimate')
            .in('id', routeIds)
            .order('id');
        
        if (error) throw error;

        displayRouteList(data);

    } catch (err) {
        console.error('搜尋過程中發生錯誤:', err);
        alert('搜尋失敗：' + err.message);
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function getIconForRoute(tags) {
    if (!tags || tags.length === 0) return 'fa-route';
    const tagSet = new Set(tags.map(t => t.toLowerCase()));
    if (tagSet.has('美食') || tagSet.has('小吃') || tagSet.has('夜市') || tagSet.has('咖啡')) return 'fa-utensils';
    if (tagSet.has('歷史') || tagSet.has('建築') || tagSet.has('博物館') || tagSet.has('北門')) return 'fa-landmark';
    if (tagSet.has('拍照') || tagSet.has('網美') || tagSet.has('旗袍')) return 'fa-camera-retro';
    if (tagSet.has('文青') || tagSet.has('藝術') || tagSet.has('書店')) return 'fa-pen-fancy';
    if (tagSet.has('親子') || tagSet.has('diy') || tagSet.has('手作')) return 'fa-child-reaching';
    if (tagSet.has('夜遊') || tagSet.has('夕陽') || tagSet.has('碼頭')) return 'fa-moon';
    if (tagSet.has('祈福') || tagSet.has('月老') || tagSet.has('宗教')) return 'fa-om';
    if (tagSet.has('茶') || tagSet.has('漢方') || tagSet.has('中藥')) return 'fa-leaf';
    if (tagSet.has('採買') || tagSet.has('市集')) return 'fa-shopping-basket';
    return 'fa-route';
}


function displayRouteList(routesData) {
    routesContainer.innerHTML = '';

    if (routesData.length === 0) {
        routesContainer.innerHTML = '<p>找不到符合條件的路線。</p>';
        return;
    }

    routesData.forEach((route, index) => {
        const tagsHtml = (route.tags || []).map(tag => 
            `<span class="tag-clickable" data-tag="${tag}">${tag}</span>`
        ).join(' ');
        
        const routeIcon = getIconForRoute(route.tags);
        const delayStyle = `style="--delay: ${index * 100}ms"`;

        const routeHtml = `
            <a href="#route=${route.id}" class="route-card" ${delayStyle}>
                <div class="route-card-content">
                    <div class="card-title-flex">
                        <i class="card-icon-display fas ${routeIcon}"></i>
                        <h2>${route.name}</h2>
                    </div>
                    <p>${route.description || '暫無描述。'}</p>
                    <div class="route-tags">
                        <strong>標籤：</strong> ${tagsHtml}
                    </div>
                </div>
                <div class="route-card-footer">
                    查看詳細行程 <i class="fas fa-arrow-right"></i>
                </div>
            </a>
        `;
        routesContainer.innerHTML += routeHtml;
    });
}


// 6. 詳細頁邏輯 (抓取 + 顯示)
// ===================================

async function initMap(locations) {
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        console.error('Google Maps API 尚未載入。');
        mapContainer.innerHTML = '無法載入地圖。請檢查您的 API 金鑰。';
        return;
    }

    if (!locations || locations.length === 0) {
        mapContainer.style.display = 'none'; 
        return;
    }

    mapContainer.style.display = 'block'; 

    const bounds = new google.maps.LatLngBounds();
    const mapCenter = { lat: locations[0].lat, lng: locations[0].lng };

    // [!! 修改 !!] 加入 mapId 以配合 Advanced Markers (雖然我們目前沒用進階樣式，但這是好習慣)
    const map = new google.maps.Map(mapContainer, {
        center: mapCenter,
        zoom: 16,
        mapId: 'DEMO_MAP_ID' 
    });

    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    const infoWindow = new google.maps.InfoWindow();

    locations.forEach(loc => {
        const position = { lat: loc.lat, lng: loc.lng };
        
        const marker = new AdvancedMarkerElement({
            map: map,
            position: position,
            title: `${loc.step}. ${loc.name}`,
        });

        bounds.extend(position);

        marker.addListener('click', () => {
            infoWindow.close();
            infoWindow.setContent(marker.title);
            infoWindow.open(marker.map, marker);
        });
    });

    map.fitBounds(bounds);
    
    if (locations.length === 1) {
        map.setZoom(17);
    }
}


async function fetchRouteDetails(routeId) {
    console.log(`正在讀取路線 ${routeId} 的詳細資料...`);
    detailContentWrapper.innerHTML = '';
    mapContainer.style.display = 'block';
    mapContainer.innerHTML = '<div id="loading" style="display:block; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> 正在載入地圖...</div>';

    const query = `
        id, name, description, tags, total_duration_estimate,
        route_attractions (
            step_order, suggested_stay_time, walking_info_to_next,
            attractions (
                name, introduction, website_url, operating_hours,
                latitude, longitude 
            )
        )
    `;

    try {
        const { data, error } = await supabase
            .from('routes')
            .select(query)
            .eq('id', routeId)
            .order('step_order', { referencedTable: 'route_attractions' })
            .single();

        if (error) throw error;
        
        displayRouteDetails(data); 

    } catch (err) {
        console.error('抓取詳細資料失敗:', err);
        detailContentWrapper.innerHTML = '<p>載入詳細資料失敗，請返回列表頁重試。</p>';
        mapContainer.style.display = 'none';
    }
}

function displayRouteDetails(routeData) {
    if (!routeData) {
        detailContentWrapper.innerHTML = '<p>找不到該路線資料。</p>';
        mapContainer.style.display = 'none';
        return;
    }

    let attractionsHtml = '';
    const attractionLocations = [];
    
    const attractions = (routeData.route_attractions || [])
        .map(ra => {
            if (!ra.attractions) return null;
            return {
                name: ra.attractions.name,
                step: ra.step_order,
                intro: ra.attractions.introduction,
                website: ra.attractions.website_url,
                hours: ra.attractions.operating_hours,
                stay_time: ra.suggested_stay_time,
                walking_info: ra.walking_info_to_next,
                lat: ra.attractions.latitude, 
                lng: ra.attractions.longitude
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.step - b.step);

    attractions.forEach(attraction => {
        attractionsHtml += `
            <div class="attraction">
                <h4>${attraction.step}. ${attraction.name}</h4>
                <p>${attraction.intro || ''}</p>
                <ul>
                    ${attraction.stay_time ? `<li><i class="fas fa-hourglass-half"></i><strong>建議停留：</strong> ${attraction.stay_time}</li>` : ''}
                    ${attraction.hours ? `<li><i class="fas fa-clock"></i><strong>營業時間：</strong> ${attraction.hours}</li>` : ''}
                    ${attraction.website ? `<li><i class="fas fa-globe"></i><strong>網站：</strong> <a href="${attraction.website}" target="_blank">點擊前往</a></li>` : ''}
                    ${attraction.walking_info ? `<li><i class="fas fa-walking"></i><strong>${attraction.walking_info}</strong></li>` : ''}
                </ul>
            </div>
        `;

        if (attraction.lat && attraction.lng) {
            attractionLocations.push({
                lat: attraction.lat,
                lng: attraction.lng,
                name: attraction.name,
                step: attraction.step
            });
        }
    });

    const tagsHtml = (routeData.tags || []).map(tag => 
        `<span class="tag-clickable" data-tag="${tag}">${tag}</span>`
    ).join(' ');

    const detailHtml = `
        <div id="detail-header">
            <h2>${routeData.name}</h2>
            <a href="#" id="back-button"><i class="fas fa-arrow-left"></i> 返回列表</a>
        </div>
        <div id="detail-content">
            <p>${routeData.description || ''}</p>
            <p class="route-tags"><strong>標籤：</strong> ${tagsHtml}</p>
            <p><i class="fas fa-map-marked-alt"></i><strong> 總時長估計：</strong> ${routeData.total_duration_estimate || 'N/A'}</p>
            
            <h3><i class="fas fa-shoe-prints"></i> 景點行程</h3>
            ${attractionsHtml.length > 0 ? attractionsHtml : '<p>此路線暫無詳細景點資訊。</p>'}
        </div>
    `;

    detailContentWrapper.innerHTML = detailHtml;

    // 呼叫地圖初始化函式
    initMap(attractionLocations);
}


// 7. 標籤點擊處理
// ===================================

function handleTagClick(event) {
    const clickedTag = event.target.closest('.tag-clickable');
    
    if (!clickedTag) {
        return; 
    }

    event.preventDefault();
    event.stopPropagation();

    const tag = clickedTag.dataset.tag;
    if (!tag) return;

    console.log(`標籤被點擊: ${tag}`);

    searchInput.value = tag;

    if (window.location.hash.startsWith('#route=')) {
        window.location.hash = '#';
    } else {
        searchRoutes();
    }
}


// 8. 事件監聽 (非同步)
// ===================================

document.addEventListener('DOMContentLoaded', async () => {
    searchButton.addEventListener('click', searchRoutes);
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            searchRoutes();
        }
    });

    window.addEventListener('hashchange', handleHashChange);
    
    routesContainer.addEventListener('click', handleTagClick);
    detailView.addEventListener('click', handleTagClick);

    try {
        await loadGoogleMapsAPI();
        handleHashChange();
    } catch (error) {
        console.error("無法初始化應用程式:", error);
    }
});