var map;
var markers = [];
var currentRoute = null;
var userMarker = null;
var userPosition = null;

window.onload = function() {
    map = L.map('map').setView([10.8505, 76.2711], 8);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
};

function findCurrentLocation(serviceType = 'hospitals') {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const { latitude, longitude } = position.coords;
                userPosition = { lat: latitude, lon: longitude };
                
                map.setView([latitude, longitude], 16);
                
                if (userMarker) map.removeLayer(userMarker);
                markers.forEach(marker => map.removeLayer(marker));
                markers = [];
                
                const userIcon = L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });
                
                userMarker = L.marker([latitude, longitude], {icon: userIcon})
                    .addTo(map)
                    .bindPopup('Your Location')
                    .openPopup();
                
                searchNearbyServices(latitude, longitude, serviceType);
            },
            function(error) {
                console.error('Error getting location:', error);
                alert('Error getting your location. Please enable location services.');
            }
        );
    } else {
        alert('Geolocation is not supported by your browser');
    }
}

async function searchNearbyServices(lat, lon, serviceType) {
    const radius = 5000; // 5km radius
    let amenityType = '';
    let icon = '';
    let title = '';

    switch(serviceType) {
        case 'hospitals':
            amenityType = 'hospital';
            icon = '🏥';
            title = 'Hospitals';
            break;
        case 'police':
            amenityType = 'police';
            icon = '👮';
            title = 'Police Stations';
            break;
        case 'fire_station':
            amenityType = 'fire_station';
            icon = '🚒';
            title = 'Fire Stations';
            break;
        case 'pharmacy':
            amenityType = 'pharmacy';
            icon = '💊';
            title = 'Pharmacies';
            break;
    }

    const query = `
        [out:json][timeout:25];
        (
            node["amenity"="${amenityType}"](around:${radius},${lat},${lon});
            way["amenity"="${amenityType}"](around:${radius},${lat},${lon});
            relation["amenity"="${amenityType}"](around:${radius},${lat},${lon});
        );
        out body;
        >;
        out skel qt;
    `;
    
    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const data = await response.json();
        
        const serviceList = document.getElementById('hospital-list');
        serviceList.innerHTML = `<h2>Nearby ${title}</h2>`;
        

        let services = [];
        
        data.elements.forEach(element => {
            if (element.type === 'node' && element.tags) {
                const distance = calculateDistance(lat, lon, element.lat, element.lon);
                services.push({
                    name: element.tags.name || `${title.slice(0, -1)}`,
                    lat: element.lat,
                    lon: element.lon,
                    distance: distance,
                    element: element
                });
            }
        });
        
        // Sort services by distance
        services.sort((a, b) => a.distance - b.distance);
        
        // Create custom icon based on service type
        const serviceIcon = L.icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png`,
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
        
        services.forEach((service, index) => {
            const opening_hours = service.element.tags.opening_hours || '24/7';
            const phone = service.element.tags.phone || service.element.tags['contact:phone'] || 'Not available';
            const openStatus = isCurrentlyOpen(opening_hours);
            
            const listItem = document.createElement('div');
            listItem.className = 'hospital-item';
            
            let statusHTML = '';
            if (openStatus.isOpen === true) {
                statusHTML = `<span class="status-badge open">🟢 Open</span>`;
            } else if (openStatus.isOpen === false) {
                statusHTML = `<span class="status-badge closed">🔴 Closed</span>`;
            }
            
            listItem.innerHTML = `
                <div class="service-info">
                    <div class="service-header">
                        <strong>${index + 1}. ${icon} ${service.name}</strong>
                        ${statusHTML}
                    </div>
                    <div class="service-details">
                        <p><span class="detail-icon">📞</span> 
                            <a href="tel:${phone}" class="phone-link">${phone}</a>
                        </p>
                        <p><span class="detail-icon">🕒</span> 
                            <span class="timing-info" title="${opening_hours}">
                                ${openStatus.status}
                            </span>
                        </p>
                        <small class="distance-info">
                            <span class="detail-icon">📍</span> 
                            ${service.distance.toFixed(2)} km away
                        </small>
                    </div>
                </div>
                <button class="route-btn" onclick="showRoute(
                    [${lat}, ${lon}],
                    [${service.lat}, ${service.lon}],
                    '${service.name}'
                )">Show Route</button>
            `;
            serviceList.appendChild(listItem);
        });

        if (services.length === 0) {
            serviceList.innerHTML += `
                <div style="padding: 15px; background: #f8d7da; border-radius: 4px; margin-top: 10px;">
                    No ${title.toLowerCase()} found within ${(radius/1000).toFixed(1)} km radius.
                </div>
            `;
        }
    } catch (error) {
        console.error('Error:', error);
        alert(`Error fetching nearby ${title.toLowerCase()}`);
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function showRoute(from, to, hospitalName) {
    if (currentRoute) {
        map.removeControl(currentRoute);
    }
    
    currentRoute = L.Routing.control({
        waypoints: [
            L.latLng(from[0], from[1]),
            L.latLng(to[0], to[1])
        ],
        routeWhileDragging: false,
        lineOptions: {
            styles: [{ color: '#2196F3', opacity: 0.8, weight: 6 }] // Blue route line
        },
        show: false,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true
    }).addTo(map);
    
    currentRoute.on('routesfound', function(e) {
        const routes = e.routes;
        const summary = routes[0].summary;
        const distance = (summary.totalDistance / 1000).toFixed(2);
        const time = Math.round(summary.totalTime / 60);
        
        document.getElementById('route-info').innerHTML = `
            <div style="background-color: #E3F2FD; padding: 15px; border-radius: 8px; border-left: 5px solid #2196F3;">
                <h3 style="color: #1565C0;">Route to ${hospitalName}</h3>
                <p>🚗 Distance: ${distance} km</p>
                <p>⏱️ Estimated Time: ${time} minutes</p>
            </div>
        `;
        
        // Fit the map to show the entire route with padding
        map.fitBounds(L.latLngBounds(from, to), {
            padding: [50, 50],
            maxZoom: 16
        });
    });
}

// Add these styles to your existing CSS
const additionalStyles = `
    .hospital-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        border-bottom: 1px solid #eee;
        transition: background-color 0.3s;
    }

    .hospital-item.selected {
        background-color: #e3f2fd;
    }

    .route-btn {
        background-color: #1976D2;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.3s;
    }

    .route-btn:hover {
        background-color: #1565C0;
    }

    .route-btn.active {
        background-color: #004BA0;
    }

    .route-details {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-top: 20px;
        padding: 15px;
    }

    .route-summary {
        display: flex;
        gap: 20px;
        margin: 15px 0;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 4px;
    }

    .summary-item {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .route-instructions {
        margin-top: 15px;
    }

    .steps-container {
        max-height: 300px;
        overflow-y: auto;
    }

    .route-step {
        display: flex;
        gap: 12px;
        padding: 12px;
        border-bottom: 1px solid #eee;
    }

    .step-number {
        background: #1976D2;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .step-content {
        flex: 1;
    }

    .step-distance {
        color: #666;
        font-size: 0.9em;
        margin-top: 4px;
    }

    .route-error {
        background: #ffebee;
        color: #c62828;
        padding: 15px;
        border-radius: 8px;
        margin-top: 20px;
    }
`;

// Add the styles to the document
const styleSheet = document.createElement("style");
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);

// Add this function to check if a place is currently open
function isCurrentlyOpen(opening_hours) {
    if (!opening_hours || opening_hours === '24/7') return { isOpen: true, status: '24/7' };
    
    const now = new Date();
    const day = now.getDay(); // 0 (Sunday) to 6 (Saturday)
    const time = now.getHours() * 100 + now.getMinutes();
    
    const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const currentDay = days[day];
    
    try {
        const timeRanges = opening_hours.split(';');
        for (let range of timeRanges) {
            if (range.includes(currentDay)) {
                const hours = range.split(' ')[1];
                const [start, end] = hours.split('-').map(t => parseInt(t.replace(':', '')));
                if (time >= start && time <= end) {
                    return { isOpen: true, status: `Open until ${formatTime(end)}` };
                }
                return { isOpen: false, status: `Opens at ${formatTime(start)}` };
            }
        }
    } catch (e) {
        return { isOpen: null, status: opening_hours };
    }
    
    return { isOpen: null, status: opening_hours };
}

// Helper function to format time
function formatTime(time) {
    const hours = Math.floor(time / 100);
    const minutes = time % 100;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
