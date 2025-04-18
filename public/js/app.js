// Global variables
let map = null;
let markers = [];
let currentLinkId = null;

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
    const visitsTable = document.getElementById('visitsTable');
    const noVisitsMessage = document.getElementById('noVisitsMessage');
    const copyButtons = document.querySelectorAll('.copy-btn');

    // Event Listeners
    createLinkBtn.addEventListener('click', createNewLink);
    backToListBtn.addEventListener('click', showLinksList);

    // Setup copy buttons
    copyButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            const targetId = this.getAttribute('data-target');
            const inputElement = document.getElementById(targetId);
            if (inputElement) {
                copyToClipboard(inputElement, this);
            }
        });
    });

    // Input validation
    linkNameInput.addEventListener('keyup', function (event) {
        if (event.key === 'Enter') {
            customUrlInput.focus();
        }
    });

    customUrlInput.addEventListener('keyup', function (event) {
        if (event.key === 'Enter') {
            customSlugInput.focus();
        }
    });

    customSlugInput.addEventListener('keyup', function (event) {
        if (event.key === 'Enter') {
            createNewLink();
        }
    });

    // Load existing links on page load
    loadLinks();

    // Function to create a new tracking link
    function createNewLink() {
        const linkName = linkNameInput.value.trim();
        const customUrl = customUrlInput.value.trim();
        const customSlug = customSlugInput.value.trim();

        if (!linkName) {
            alert('Please enter a name for your tracking link.');
            linkNameInput.focus();
            return;
        }

        // Validate custom URL if provided
        if (customUrl && !isValidUrl(customUrl)) {
            alert('Please enter a valid URL starting with http:// or https://');
            customUrlInput.focus();
            return;
        }

        // Validate custom slug if provided
        if (customSlug && !/^[a-zA-Z0-9-_]+$/.test(customSlug)) {
            alert('Custom slug can only contain letters, numbers, hyphens, and underscores.');
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
                console.log('Link created:', data); // Add debugging

                // Display the new links
                if (data && data.url) {
                    trackingUrlInput.value = data.url;

                    if (data.masked_urls) {
                        maskedFileUrlInput.value = data.masked_urls.file || '';
                        maskedPhotoUrlInput.value = data.masked_urls.photo || '';
                    }

                    newLinkAlert.classList.remove('d-none');

                    // Clear the input fields
                    linkNameInput.value = '';
                    customUrlInput.value = '';
                    customSlugInput.value = '';

                    // Reload the links list
                    loadLinks();
                } else {
                    console.error('Invalid response format:', data);
                    alert('Error creating link: Invalid server response');
                }
            })
            .catch(error => {
                console.error('Error creating link:', error);
                alert(`Failed to create tracking link: ${error.message}`);
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
        fetch('/api/links')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(links => {
                console.log('Loaded links:', links); // Add debugging

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

                    const linkEl = document.createElement('div');
                    linkEl.className = 'list-group-item list-group-item-action';

                    let redirectText = '';
                    if (link.custom_url) {
                        redirectText = `<small class="text-muted">Redirects to: ${escapeHtml(link.custom_url)}</small>`;
                    }

                    // Show all available link types
                    const linksHtml = `
                        <div class="link-options mt-2">
                            <small class="text-muted">
                                <a href="#" class="link-type-toggle" data-id="${link.id}" data-type="standard">Standard</a> | 
                                <a href="#" class="link-type-toggle" data-id="${link.id}" data-type="file">File</a> | 
                                <a href="#" class="link-type-toggle" data-id="${link.id}" data-type="photo">Photo</a>
                            </small>
                        </div>
                    `;

                    linkEl.innerHTML = `
                        <div class="d-flex w-100 justify-content-between align-items-center">
                            <h5 class="mb-1">${escapeHtml(link.name)}</h5>
                            <small class="text-muted">${formatDate(link.created_at)}</small>
                        </div>
                        <p class="mb-1 link-url" id="link-url-${link.id}">${link.url}</p>
                        ${redirectText}
                        ${linksHtml}
                    `;

                    // Add click event to view link details
                    linkEl.addEventListener('click', function (e) {
                        // Don't trigger if clicking on a link-type-toggle
                        if (e.target.classList.contains('link-type-toggle')) {
                            e.preventDefault();
                            const linkType = e.target.getAttribute('data-type');
                            const linkId = e.target.getAttribute('data-id');
                            const linkUrlElement = document.getElementById(`link-url-${linkId}`);

                            if (linkUrlElement) {
                                // Change the displayed URL based on type
                                if (linkType === 'standard') {
                                    linkUrlElement.textContent = link.url;
                                } else if (linkType === 'file' && link.masked_urls && link.masked_urls.file) {
                                    linkUrlElement.textContent = link.masked_urls.file;
                                } else if (linkType === 'photo' && link.masked_urls && link.masked_urls.photo) {
                                    linkUrlElement.textContent = link.masked_urls.photo;
                                }
                            }
                            return;
                        }

                        // Regular click - show details
                        viewLinkDetails(link.id);
                    });

                    linksList.appendChild(linkEl);
                });
            })
            .catch(error => {
                console.error('Error loading links:', error);
                linksList.innerHTML = `<div class="alert alert-danger">Failed to load tracking links: ${error.message}</div>`;
            });
    }

    // Function to view link details
    function viewLinkDetails(linkId) {
        currentLinkId = linkId;

        fetch(`/api/links/${linkId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Link details:', data); // Add debugging

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
                    customUrlDisplay.classList.remove('d-none');
                } else {
                    customUrlDisplay.classList.add('d-none');
                }

                // Clear the visits table
                visitsTable.innerHTML = '';

                // Show/hide elements
                linkDetails.classList.remove('d-none');
                document.querySelector('.row.mb-4').classList.add('d-none');

                if (data.visits && data.visits.length > 0) {
                    // Hide the "no visits" message
                    noVisitsMessage.classList.add('d-none');

                    // Populate the visits table
                    data.visits.forEach(visit => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${formatDate(visit.visited_at)}</td>
                            <td>${visit.latitude}</td>
                            <td>${visit.longitude}</td>
                            <td>${escapeHtml(visit.ip_address || 'Unknown')}</td>
                            <td><div class="user-agent-cell" title="${escapeHtml(visit.user_agent || 'Unknown')}">${escapeHtml(visit.user_agent || 'Unknown')}</div></td>
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
                }
            })
            .catch(error => {
                console.error('Error loading link details:', error);
                alert('Failed to load link details. Please try again.');
            });
    }

    // Function to show the links list (go back)
    function showLinksList() {
        linkDetails.classList.add('d-none');
        document.querySelector('.row.mb-4').classList.remove('d-none');
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
                const originalHtml = buttonElement.innerHTML;
                buttonElement.classList.add('copy-success');
                buttonElement.innerHTML = '<i class="bi bi-check"></i> Copied';

                // Reset button after a delay
                setTimeout(() => {
                    buttonElement.classList.remove('copy-success');
                    buttonElement.innerHTML = originalHtml;
                }, 2000);
            })
            .catch(err => {
                console.error('Error copying text: ', err);
                alert('Failed to copy to clipboard');
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
});

// Initialize Google Map
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 0, lng: 0 },
        zoom: 2,
        styles: [
            {
                featureType: 'poi',
                stylers: [{ visibility: 'off' }]
            }
        ]
    });

    if (currentLinkId) {
        fetch(`/api/links/${currentLinkId}`)
            .then(response => response.json())
            .then(data => {
                if (data.visits && data.visits.length > 0) {
                    updateMapMarkers(data.visits);
                }
            })
            .catch(error => {
                console.error('Error loading visits for map:', error);
            });
    }
}

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
                <div style="max-width: 200px;">
                    <h6 style="margin-bottom: 5px;">Visit Details</h6>
                    <p style="margin: 2px 0;"><strong>Time:</strong> ${new Date(visit.visited_at).toLocaleString()}</p>
                    <p style="margin: 2px 0;"><strong>Coordinates:</strong> ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}</p>
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