// Global variables
let map;
let markers = [];
let currentLinkId = null;
const host = window.location.origin;

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function () {
    // UI Elements
    const createLinkBtn = document.getElementById('createLinkBtn');
    const linkNameInput = document.getElementById('linkName');
    const customUrlInput = document.getElementById('customUrl');
    const customSlugInput = document.getElementById('customSlug');
    const newLinkAlert = document.getElementById('newLinkAlert');
    const trackingUrlInput = document.getElementById('trackingUrl');
    const maskedFileUrlInput = document.getElementById('maskedFileUrl');
    const maskedPhotoUrlInput = document.getElementById('maskedPhotoUrl');
    const linksList = document.getElementById('linksList');
    const noLinksMessage = document.getElementById('noLinksMessage');
    const linkDetails = document.getElementById('linkDetails');
    const selectedLinkName = document.getElementById('selectedLinkName');
    const selectedLinkUrl = document.getElementById('selectedLinkUrl');
    const selectedMaskedFileUrl = document.getElementById('selectedMaskedFileUrl');
    const selectedMaskedPhotoUrl = document.getElementById('selectedMaskedPhotoUrl');
    const customUrlDisplay = document.getElementById('customUrlDisplay');
    const customUrlValue = document.getElementById('customUrlValue');
    const backToListBtn = document.getElementById('backToListBtn');
    const deleteLinkDetailBtn = document.getElementById('deleteLinkDetailBtn');
    const visitsTable = document.getElementById('visitsTable');
    const noVisitsMessage = document.getElementById('noVisitsMessage');
    const copyButtons = document.querySelectorAll('.copy-btn');
    const refreshLinksBtn = document.getElementById('refreshLinksBtn');
    const refreshVisitsBtn = document.getElementById('refreshVisitsBtn');
    const tabButtons = document.querySelectorAll('.tab');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Event Listeners
    if (createLinkBtn) {
        createLinkBtn.addEventListener('click', function (e) {
            e.preventDefault();
            createNewLink();
        });
    }

    if (backToListBtn) {
        backToListBtn.addEventListener('click', showLinksList);
    }

    if (refreshLinksBtn) {
        refreshLinksBtn.addEventListener('click', function (e) {
            e.preventDefault();
            loadLinks();
            showToast('Links refreshed', 'success');
        });
    }

    if (refreshVisitsBtn) {
        refreshVisitsBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (currentLinkId) {
                viewLinkDetails(currentLinkId);
                showToast('Visits refreshed', 'success');
            }
        });
    }

    // Set up delete button in detail view
    if (deleteLinkDetailBtn) {
        deleteLinkDetailBtn.addEventListener('click', function () {
            if (currentLinkId && confirm('Are you sure you want to delete this tracking link? This action cannot be undone.')) {
                deleteLink(currentLinkId);
            }
        });
    }

    // Setup copy buttons
    copyButtons.forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('data-target');
            const inputElement = document.getElementById(targetId);
            if (inputElement) {
                copyToClipboard(inputElement, this);
            }
        });
    });

    // Setup tab buttons
    tabButtons.forEach(tab => {
        tab.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('data-target');

            // Remove active class from all tabs and tab panes
            tabButtons.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            // Add active class to clicked tab and its target pane
            this.classList.add('active');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Input validation
    if (linkNameInput) {
        linkNameInput.addEventListener('keyup', function (event) {
            if (event.key === 'Enter') {
                customUrlInput.focus();
            }
        });
    }

    if (customUrlInput) {
        customUrlInput.addEventListener('keyup', function (event) {
            if (event.key === 'Enter') {
                customSlugInput.focus();
            }
        });
    }

    if (customSlugInput) {
        customSlugInput.addEventListener('keyup', function (event) {
            if (event.key === 'Enter') {
                createNewLink();
            }
        });
    }

    // Load existing links on page load
    loadLinks();

    // Function to create a new tracking link
    function createNewLink() {
        const linkName = linkNameInput.value.trim();
        const customUrl = customUrlInput.value.trim();
        const customSlug = customSlugInput.value.trim();

        if (!linkName) {
            showToast('Please enter a name for your tracking link', 'error');
            linkNameInput.focus();
            return;
        }

        // Validate custom URL if provided
        if (customUrl && !isValidUrl(customUrl)) {
            showToast('Please enter a valid URL starting with http:// or https://', 'error');
            customUrlInput.focus();
            return;
        }

        // Validate custom slug if provided
        if (customSlug && !/^[a-zA-Z0-9-_]+$/.test(customSlug)) {
            showToast('Custom slug can only contain letters, numbers, hyphens, and underscores', 'error');
            customSlugInput.focus();
            return;
        }

        const requestData = {
            name: linkName,
            customUrl: customUrl || null,
            customSlug: customSlug || null
        };

        console.log('Sending request:', requestData);

        // API call to create a new link
        fetch('/api/links', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Link created:', data);

                // Display the new links
                if (data && data.url) {
                    trackingUrlInput.value = data.url;

                    if (data.masked_urls) {
                        maskedFileUrlInput.value = data.masked_urls.file || '';
                        maskedPhotoUrlInput.value = data.masked_urls.photo || '';
                    }

                    newLinkAlert.classList.remove('d-none');
                    showToast('Tracking link created successfully!', 'success');

                    // Clear the input fields
                    linkNameInput.value = '';
                    customUrlInput.value = '';
                    customSlugInput.value = '';

                    // Reload the links list
                    loadLinks();
                } else {
                    console.error('Invalid response format:', data);
                    showToast('Error creating link: Invalid server response', 'error');
                }
            })
            .catch(error => {
                console.error('Error creating link:', error);
                showToast(`Failed to create tracking link: ${error.message}`, 'error');
            });
    }

    // Validate URL
    function isValidUrl(url) {
        try {
            const newUrl = new URL(url);
            return newUrl.protocol === 'http:' || newUrl.protocol === 'https:';
        } catch (err) {
            return false;
        }
    }

    // Function to load all tracking links
    function loadLinks() {
        // Show loading indicator
        document.getElementById('loadingLinks').classList.remove('d-none');
        linksList.classList.add('d-none');

        fetch('/api/links')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(links => {
                console.log('Loaded links:', links);

                // Hide loading indicator
                document.getElementById('loadingLinks').classList.add('d-none');
                linksList.classList.remove('d-none');

                // Clear the links list
                linksList.innerHTML = '';

                if (!Array.isArray(links) || links.length === 0) {
                    // Show the "no links" message
                    noLinksMessage.classList.remove('d-none');
                    return;
                }

                // Hide the "no links" message
                noLinksMessage.classList.add('d-none');

                // Add each link to the list
                links.forEach(link => {
                    if (!link || !link.id) {
                        console.warn('Invalid link data:', link);
                        return;
                    }

                    const linkEl = document.createElement('a');
                    linkEl.className = 'link-item';
                    linkEl.href = '#';

                    let redirectInfo = '';
                    if (link.custom_url) {
                        redirectInfo = `<div class="link-item-subtitle">Redirects to: ${escapeHtml(link.custom_url)}</div>`;
                    }

                    linkEl.innerHTML = `
                        <div class="link-item-icon">
                            <i class="fas fa-link"></i>
                        </div>
                        <div class="link-item-content">
                            <div class="link-item-title">${escapeHtml(link.name)}</div>
                            <div class="link-item-subtitle">${escapeHtml(link.url)}</div>
                            ${redirectInfo}
                            <div class="link-item-subtitle">Created: ${formatDate(link.created_at)}</div>
                        </div>
                    `;

                    // Add click event to view link details
                    linkEl.addEventListener('click', function (e) {
                        e.preventDefault();
                        viewLinkDetails(link.id);

                        // Clear active class from all links
                        document.querySelectorAll('.link-item').forEach(item => {
                            item.classList.remove('link-item-active');
                        });

                        // Add active class to this link
                        linkEl.classList.add('link-item-active');
                    });

                    linksList.appendChild(linkEl);
                });
            })
            .catch(error => {
                console.error('Error loading links:', error);
                document.getElementById('loadingLinks').classList.add('d-none');
                linksList.classList.remove('d-none');
                showToast(`Failed to load tracking links: ${error.message}`, 'error');
            });
    }

    // Function to view link details
    function viewLinkDetails(linkId) {
        currentLinkId = linkId;

        // Show loading indicator
        document.getElementById('loadingVisits').classList.remove('d-none');

        fetch(`/api/links/${linkId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Link details:', data);

                // Hide loading indicator
                document.getElementById('loadingVisits').classList.add('d-none');

                // Update UI with link details
                selectedLinkName.innerText = escapeHtml(data.name);

                // Set all link URLs
                selectedLinkUrl.value = data.url || '';

                if (data.masked_urls) {
                    selectedMaskedFileUrl.value = data.masked_urls.file || '';
                    selectedMaskedPhotoUrl.value = data.masked_urls.photo || '';
                }

                // Show custom URL if available
                if (data.custom_url) {
                    customUrlValue.textContent = data.custom_url;
                    customUrlValue.href = data.custom_url;
                    customUrlDisplay.classList.remove('d-none');
                } else {
                    customUrlDisplay.classList.add('d-none');
                }

                // Clear the visits table
                visitsTable.innerHTML = '';

                // Show the details section
                linkDetails.classList.remove('d-none');

                if (data.visits && data.visits.length > 0) {
                    // Hide the "no visits" message
                    noVisitsMessage.classList.add('d-none');
                    document.querySelector('.table-responsive').style.display = 'block';

                    // Populate the visits table
                    data.visits.forEach(visit => {
                        const row = document.createElement('tr');

                        // Format location information
                        let locationInfo = 'Unknown';
                        if (visit.city || visit.region || visit.country) {
                            const locationParts = [];
                            if (visit.city) locationParts.push(visit.city);
                            if (visit.region) locationParts.push(visit.region);
                            if (visit.country) locationParts.push(visit.country);
                            locationInfo = locationParts.join(', ');
                        }

                        // Determine source label
                        let sourceLabel = 'Unknown';
                        if (visit.location_source === 'browser') {
                            sourceLabel = 'Browser GPS';
                        } else if (visit.location_source === 'ip') {
                            sourceLabel = 'IP Geolocation';
                        }

                        row.innerHTML = `
                            <td>${formatDate(visit.visited_at)}</td>
                            <td>${visit.latitude ? visit.latitude.toFixed(6) : 'N/A'}</td>
                            <td>${visit.longitude ? visit.longitude.toFixed(6) : 'N/A'}</td>
                            <td>${escapeHtml(locationInfo)}</td>
                            <td>${escapeHtml(sourceLabel)}</td>
                            <td>${escapeHtml(visit.ip_address || 'Unknown')}</td>
                            <td><div title="${escapeHtml(visit.user_agent || 'Unknown')}">${escapeHtml(visit.user_agent || 'Unknown')}</div></td>
                        `;
                        visitsTable.appendChild(row);
                    });

                    // Initialize or update the map
                    if (!map) {
                        initMap();
                    } else {
                        updateMapMarkers(data.visits);
                    }
                } else {
                    // Show the "no visits" message
                    noVisitsMessage.classList.remove('d-none');
                    document.querySelector('.table-responsive').style.display = 'none';
                }
            })
            .catch(error => {
                console.error('Error loading link details:', error);
                document.getElementById('loadingVisits').classList.add('d-none');
                showToast('Failed to load link details. Please try again.', 'error');
            });
    }

    // Function to show the links list (go back)
    function showLinksList() {
        linkDetails.classList.add('d-none');
        currentLinkId = null;
    }

    // Helper function to copy text to clipboard
    function copyToClipboard(inputElement, buttonElement) {
        // Select the text
        inputElement.select();
        inputElement.setSelectionRange(0, 99999);

        // Copy the text
        navigator.clipboard.writeText(inputElement.value)
            .then(() => {
                // Visual feedback
                const originalText = buttonElement.innerHTML;
                buttonElement.innerHTML = '<i class="fas fa-check"></i> Copied';

                // Show toast notification
                showToast('Copied to clipboard!', 'success');

                // Reset button after a delay
                setTimeout(() => {
                    buttonElement.innerHTML = originalText;
                }, 2000);
            })
            .catch(err => {
                console.error('Error copying text: ', err);
                showToast('Failed to copy to clipboard', 'error');
            });
    }

    // Helper function to format date/time
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    // Helper function to escape HTML to prevent XSS
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Function to delete a tracking link
    function deleteLink(linkId) {
        fetch(`/api/links/${linkId}`, {
            method: 'DELETE'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                // Refresh the links list
                loadLinks();

                // If we're viewing the details of the deleted link, go back to the list
                if (currentLinkId === linkId) {
                    showLinksList();
                }

                // Show success message
                showToast('Link deleted successfully', 'success');
            })
            .catch(error => {
                console.error('Error deleting link:', error);
                showToast(`Failed to delete link: ${error.message}`, 'error');
            });
    }

    // Toast notification function
    function showToast(message, type = 'info') {
        const toastContainer = document.querySelector('.toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        if (type === 'warning') icon = 'exclamation-triangle';

        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas fa-${icon}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-message">${escapeHtml(message)}</div>
            </div>
        `;

        toastContainer.appendChild(toast);

        // Remove toast after 3 seconds
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }

    // Initialize Google Map
    window.initMap = function () {
        map = new google.maps.Map(document.getElementById('map'), {
            zoom: 2,
            center: { lat: 10, lng: 0 },
            styles: [
                {
                    featureType: 'water',
                    elementType: 'geometry',
                    stylers: [{ color: '#e9e9e9' }, { lightness: 17 }]
                },
                {
                    featureType: 'landscape',
                    elementType: 'geometry',
                    stylers: [{ color: '#f5f5f5' }, { lightness: 20 }]
                },
                {
                    featureType: 'road.highway',
                    elementType: 'geometry.fill',
                    stylers: [{ color: '#ffffff' }, { lightness: 17 }]
                },
                {
                    featureType: 'administrative',
                    elementType: 'geometry.stroke',
                    stylers: [{ color: '#fefefe' }, { lightness: 17 }, { weight: 1.2 }]
                }
            ]
        });
    };

    // Update map markers from visit data
    function updateMapMarkers(visits) {
        // Clear existing markers
        markers.forEach(marker => marker.setMap(null));
        markers = [];

        if (!visits || visits.length === 0) return;

        const bounds = new google.maps.LatLngBounds();

        // Add new markers
        visits.forEach(visit => {
            if (!visit.latitude || !visit.longitude) return;

            const position = {
                lat: parseFloat(visit.latitude),
                lng: parseFloat(visit.longitude)
            };

            const marker = new google.maps.Marker({
                position,
                map,
                title: `Visit on ${new Date(visit.visited_at).toLocaleString()}`,
                animation: google.maps.Animation.DROP
            });

            // Add info window with visit details
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div class="info-window">
                        <h6>Visit Details</h6>
                        <p><strong>Time:</strong> ${new Date(visit.visited_at).toLocaleString()}</p>
                        <p><strong>Coordinates:</strong> ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}</p>
                    </div>
                `
            });

            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });

            markers.push(marker);
            bounds.extend(position);
        });

        // Fit map to the markers
        if (markers.length > 0) {
            if (markers.length === 1) {
                map.setCenter(markers[0].getPosition());
                map.setZoom(13);
            } else {
                map.fitBounds(bounds);
            }
        }
    }
}); 