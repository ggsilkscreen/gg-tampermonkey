// ==UserScript==
// @name         Ink Color Dropdown Selector B v 9.23
// @namespace    http://tampermonkey.net/
// @version      3.0.1
// @description  Dropdown color selector with typing option
// @author       You
// @match        https://app.teesom.com/saiw/orderentry.asp*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-ink-colors.user.js
// @downloadURL  https://raw.githubusercontent.com/ggsilkscreen/gg-tampermonkey/main/scripts/teesom-ink-colors.user.js
// ==/UserScript==
(function() {
    'use strict';
    console.log('Dropdown Ink Color Selector loaded');

    // Define ink color options
    const inkColors = [
        { color: '#000000', name: 'Black', value: 'Black' },
        { color: '#FFFFFF', name: 'White', value: 'White' },
        { color: '#6B6B6B', name: 'Dark Gray', value: 'Dark Gray - Graphite' },
        { color: '#778899', name: 'Gray', value: 'Gray ( standard ) - ELTS Battleship Gray' },
        { color: '#F5F5DC', name: 'Ivory', value: 'Ivory / Off White PMS 7506' },
        { color: '#FF0000', name: 'Red', value: 'Red - ELTS True Red' },
        { color: '#DC143C', name: 'Light Red', value: 'Lobster Trap Lt. Red - PMS 1785c' },
        { color: '#800000', name: 'Maroon', value: 'Maroon - ELTS G&G Maroon' },
        { color: '#722F37', name: 'Brandywine', value: 'Brandywine - Epic Brandywine' },
        { color: '#FF8C00', name: 'Orange', value: 'Orange - ELTS Orange' },
        { color: '#FFFF00', name: 'Lemon Yellow', value: 'Lemon Yellow - ELTS Team Yellow' },
        { color: '#FBBC04', name: 'Yellow Gold', value: 'Yellow Gold - ELTSTrueGold' },
        { color: '#FFD700', name: 'Metallic Gold', value: 'Metallic Gold' },
        { color: '#DAA520', name: 'Vegas Gold', value: 'Vegas Gold - Epic 86780' },
        { color: '#00FF00', name: 'Kelly Green', value: 'Kelly Green - ELTS Shamrock' },
        { color: '#32CD32', name: 'Flo Green', value: 'Flo Green - ELTS Sho Flo Green' },
        { color: '#228B22', name: 'Forest Green', value: 'Forest - ELTS Dark Green' },
        { color: '#4B5320', name: 'Military Green', value: 'Military Green' },
        { color: '#9ACD32', name: 'Nelson Green', value: 'Nelson Green - PMS 393' },
        { color: '#66FF00', name: 'Triple M Green', value: 'Triple M Green - PMS 368' },
        { color: '#0080FF', name: 'G&G Blue', value: 'G&G Blue - ELTS Retro Blue ' },
        { color: '#ADD8E6', name: 'Light Blue', value: 'Light Blue - ELTS GG Light Blue' },
        { color: '#4169E1', name: 'Royal Blue', value: 'Royal Blue - ELTS Med Royal' },
        { color: '#000080', name: 'Navy', value: 'Navy - ELTS Cobalt' },
        { color: '#4682B4', name: 'Steel Blue', value: 'Cavicchi STEEL Blue - *Wilflex - PMS 5503' },
        { color: '#2F4F4F', name: 'Slate Blue', value: 'Lobster Trap SLATE Blue - PMS 646c' },
        { color: '#00BFFF', name: 'DBMS Blue', value: 'DBMS Blue- PMS 299c' },
        { color: '#008080', name: 'Willwork Teal', value: 'Willwork Teal - PMS 320C' },
        { color: '#004D40', name: 'Dark Teal', value: 'Dark Teal - PMS 3035c' },
        { color: '#008B8B', name: 'Teal ( PlySouth )', value: 'Teal ( PlySouth ) - ELTS PMS 3125' },
        { color: '#800080', name: 'Purple', value: 'Purple - ELT-S Purple' },
        { color: '#FF69B4', name: 'Pink', value: 'ELTS Millzy Pink' },
        { color: '#FF1493', name: 'Neon Pink', value: 'Neon Pink - Neon Pink' },
        { color: '#964B00', name: 'Brown', value: 'Brown - Epic Spice Brown' },
        { color: '#D2B48C', name: 'Tan', value: 'Tan - Wilflex 728C' },
        { color: '#C0C0C0', name: 'Metallic Silver', value: 'Metallic Silver - Metallic Silver' },
        { color: '#36454F', name: 'Blackbeard Gray', value: 'Blackbeard Gray - PMS 7543' }
    ];

    // The site's "add a color" UI (as of the current build):
    //   <div class="jcw-slideout-mt-12 jcw-slideout-flex-row">
    //     <input id="art_v2_color_input" class="jcw-slideout-form-input jcw-slideout-flex-1" placeholder="Add colors (comma-separated)...">
    //     <button class="jcw-slideout-btn jcw-slideout-btn-outline art-v2-add-color">Add</button>
    //     <button class="jcw-slideout-btn jcw-slideout-btn-outline art-v2-color-quickedit">Quick Edit</button>
    //   </div>
    //   <div id="art_v2_color_tags" class="jcw-slideout-color-tags">
    //     <span class="jcw-slideout-color-tag ..." data-color-index="0">
    //       <span class="material-icons ... art-v2-color-grip">drag_indicator</span>
    //       Black
    //       <span class="art-v2-color-remove material-icons ..." data-index="0">close</span>
    //     </span>
    //   </div>
    //
    // Unlike the old "add_mini_tag_box" input, this input does NOT hold the
    // selected colors itself - it's just a staging box you type into, then
    // click "Add" (or the site adds it for you). Selected colors live as
    // separate tag elements in #art_v2_color_tags, and each tag has its own
    // "x" (remove) button. So instead of writing a comma-joined string into
    // input.value, we drive the site's own Add/Remove buttons.

    const INPUT_SELECTOR = 'input#art_v2_color_input';
    const TAGS_CONTAINER_ID = 'art_v2_color_tags';
    const TAG_SELECTOR = '.jcw-slideout-color-tag';
    const ADD_BUTTON_SELECTOR = '.art-v2-add-color';
    const REMOVE_BUTTON_SELECTOR = '.art-v2-color-remove';

    // The site rebuilds the entire "Add colors" row (input + Add + Quick
    // Edit buttons) from scratch every time a color is added or removed -
    // it doesn't just update the existing DOM nodes in place. That means our
    // enhanced input, its dropdown button, and its open dropdown all get
    // discarded the instant the user picks a color. The MutationObserver
    // below notices the fresh input and re-enhances it automatically; its
    // dropdown just starts closed by default, which is the desired
    // behavior (pick one color, dropdown closes, click the arrow again for
    // another).
    //
    // The site's real "Add" button and each tag's "x" (remove) button both
    // live outside our wrapper div (see enhanceInput). When we click them
    // programmatically, the resulting click event bubbles up to the
    // document-level "click outside closes the dropdown" listener below.
    // That's harmless now (we're closing the dropdown ourselves right
    // after anyway), but this flag avoids any double-handling while that
    // synthetic click is in flight.
    let suppressOutsideClose = false;

    function getTagText(tagEl) {
        const textNode = Array.from(tagEl.childNodes).find(
            n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
        );
        return textNode ? textNode.textContent.trim() : '';
    }

    function enhanceInput(input) {
        if (input.dataset.enhanced) return;
        input.dataset.enhanced = 'true';
        input.placeholder = 'Type or select colors...';
        input.style.cursor = 'text';

        const row = input.parentElement; // .jcw-slideout-flex-row (input + Add + Quick Edit)
        const addBtn = row ? row.querySelector(ADD_BUTTON_SELECTOR) : null;

        // Create wrapper container around just the input, so the row's
        // Add / Quick Edit buttons stay where they are.
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position: relative; display: inline-block; flex: 1; min-width: 0;';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        // Create dropdown toggle button
        const dropdownBtn = document.createElement('button');
        dropdownBtn.type = 'button';
        dropdownBtn.innerHTML = '▼';
        dropdownBtn.style.cssText = `
            position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
            background: #f8f9fa; border: 1px solid #ccc; border-radius: 3px;
            width: 25px; height: 25px; cursor: pointer; font-size: 12px;
            display: flex; align-items: center; justify-content: center;
        `;

        // Create dropdown container
        const dropdown = document.createElement('div');
        dropdown.style.cssText = `
            position: absolute; z-index: 999999;
            background: white; border: 1px solid #ccc;
            max-height: 300px; overflow-y: auto; display: none;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1); color: black;
            top: 100%; left: 0; min-width: 250px;
        `;

        // Create search input for dropdown
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search colors...';
        searchInput.style.cssText = `
            width: 100%; padding: 8px; border: none; border-bottom: 1px solid #eee;
            box-sizing: border-box; outline: none; color: black; background: white;
        `;

        // Create color list container
        const colorList = document.createElement('div');
        colorList.style.cssText = 'max-height: 250px; overflow-y: auto;';

        // Track selected colors (read from the site's own tag elements)
        let selectedColors = [];

        function getTagsContainer() {
            return document.getElementById(TAGS_CONTAINER_ID);
        }

        // Function to read currently selected colors from the site's tag list
        function parseCurrentColors() {
            selectedColors = [];
            const container = getTagsContainer();
            if (!container) return;
            container.querySelectorAll(TAG_SELECTOR).forEach(tag => {
                const text = getTagText(tag);
                if (text) selectedColors.push(text);
            });
        }

        // Add a color via the site's real "Add" button
        async function addColorToSite(value) {
            const liveAddBtn = row ? row.querySelector(ADD_BUTTON_SELECTOR) : addBtn;
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            suppressOutsideClose = true;
            if (liveAddBtn) {
                liveAddBtn.click();
            } else {
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }
            suppressOutsideClose = false;
            await new Promise(r => setTimeout(r, 200));
            input.value = '';
        }

        // Remove a color via its tag's own "x" button
        async function removeColorFromSite(value) {
            const container = getTagsContainer();
            if (!container) return;
            const tag = Array.from(container.querySelectorAll(TAG_SELECTOR)).find(
                t => getTagText(t) === value
            );
            if (tag) {
                const removeBtn = tag.querySelector(REMOVE_BUTTON_SELECTOR);
                if (removeBtn) {
                    suppressOutsideClose = true;
                    removeBtn.click();
                    suppressOutsideClose = false;
                }
                await new Promise(r => setTimeout(r, 200));
            }
        }

        // Function to render color options
        function renderColorOptions(colors) {
            colorList.innerHTML = '';
            colors.forEach(colorData => {
                const option = document.createElement('div');
                const isSelected = selectedColors.includes(colorData.value);
                option.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; color: black; ${isSelected ? 'background: #e3f2fd;' : ''}"
                         class="color-option" data-value="${colorData.value}">
                        <div style="
                            width: 20px; height: 20px; border-radius: 3px; flex-shrink: 0;
                            background: ${colorData.color};
                            border: 1px solid ${colorData.color === '#FFFFFF' ? '#ddd' : colorData.color};
                        "></div>
                        <span style="font-size: 13px; color: black; ${isSelected ? 'font-weight: bold;' : ''}">${colorData.name}</span>
                        ${isSelected ? '<span style="margin-left: auto; color: #1976d2;">✓</span>' : ''}
                    </div>
                `;
                const optionDiv = option.firstElementChild;
                // Hover effect
                optionDiv.addEventListener('mouseenter', function() {
                    if (!isSelected) {
                        this.style.background = '#f5f5f5';
                    }
                });
                optionDiv.addEventListener('mouseleave', function() {
                    if (!isSelected) {
                        this.style.background = '';
                    }
                });
                // Click to select/deselect - closes the dropdown afterward;
                // click the dropdown arrow again to pick another color.
                optionDiv.addEventListener('click', async function() {
                    const value = this.dataset.value;
                    const alreadySelected = selectedColors.includes(value);
                    optionDiv.style.pointerEvents = 'none';
                    if (alreadySelected) {
                        await removeColorFromSite(value);
                    } else {
                        await addColorToSite(value);
                    }
                    if (input.isConnected) {
                        // The site updated this row in place (no rebuild) -
                        // close the dropdown ourselves since a pick was made.
                        parseCurrentColors();
                        hideDropdown();
                    }
                    // If input.isConnected is false, the site rebuilt the
                    // whole row and the MutationObserver already re-enhanced
                    // the replacement - its dropdown starts closed by
                    // default, which is what we want here.
                });
                colorList.appendChild(option);
            });
        }

        // Search functionality
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const filtered = inkColors.filter(color =>
                color.name.toLowerCase().includes(searchTerm) ||
                color.value.toLowerCase().includes(searchTerm)
            );
            renderColorOptions(filtered);
        });

        // Decide whether the dropdown should open below the input (normal)
        // or above it (flipped). The Colors section this input lives in is
        // often near the bottom of a scrollable side panel, so opening
        // downward can push the color list past the visible viewport,
        // making it look like nothing shows up when it's really just
        // rendered off-screen. This mirrors it upward when there isn't
        // enough room below.
        function positionDropdown() {
            const inputRect = input.getBoundingClientRect();
            const dropdownHeight = 300; // matches max-height in dropdown's CSS
            const spaceBelow = window.innerHeight - inputRect.bottom;
            const spaceAbove = inputRect.top;
            if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                // Not enough room below, and more room above - flip up
                dropdown.style.top = 'auto';
                dropdown.style.bottom = '100%';
            } else {
                dropdown.style.bottom = 'auto';
                dropdown.style.top = '100%';
            }
        }

        // Show dropdown
        function showDropdown() {
            parseCurrentColors();
            // Set dropdown width to match input width
            const inputWidth = input.offsetWidth;
            dropdown.style.width = Math.max(inputWidth, 250) + 'px';
            dropdown.style.right = 'auto'; // Remove right positioning
            dropdown.style.display = 'block';
            positionDropdown();
            searchInput.value = '';
            renderColorOptions(inkColors);
            searchInput.focus();
            dropdownBtn.innerHTML = '▲';
        }

        // Hide dropdown
        function hideDropdown() {
            dropdown.style.display = 'none';
            dropdownBtn.innerHTML = '▼';
        }

        // Toggle dropdown
        dropdownBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (dropdown.style.display === 'none' || !dropdown.style.display) {
                showDropdown();
            } else {
                hideDropdown();
            }
        });

        // Note: intentionally NOT opening the dropdown on input focus.
        // The site re-focuses this input itself after every Add/Remove
        // (so you can keep typing), and that used to reopen our dropdown
        // right back up. Opening is now only via the ▼ button, so a pick
        // reliably stays closed until you click it again.

        // If the user manually types a color and clicks the site's own
        // "Add" button (rather than using our dropdown), refresh checkmarks
        // while the dropdown is open.
        if (addBtn) {
            addBtn.addEventListener('click', function() {
                setTimeout(() => {
                    if (dropdown.style.display === 'block') {
                        parseCurrentColors();
                        renderColorOptions(
                            searchInput.value
                                ? inkColors.filter(c =>
                                      c.name.toLowerCase().includes(searchInput.value.toLowerCase()) ||
                                      c.value.toLowerCase().includes(searchInput.value.toLowerCase())
                                  )
                                : inkColors
                        );
                    }
                }, 250);
            });
        }

        // Keep checkmarks in sync if a tag is removed manually (via its own
        // "x") while our dropdown happens to be open.
        const tagsContainer = getTagsContainer();
        if (tagsContainer) {
            const tagsObserver = new MutationObserver(function() {
                if (dropdown.style.display === 'block') {
                    parseCurrentColors();
                    renderColorOptions(
                        searchInput.value
                            ? inkColors.filter(c =>
                                  c.name.toLowerCase().includes(searchInput.value.toLowerCase()) ||
                                  c.value.toLowerCase().includes(searchInput.value.toLowerCase())
                              )
                            : inkColors
                    );
                }
            });
            tagsObserver.observe(tagsContainer, { childList: true });
        }

        // Hide dropdown when clicking outside (but not for clicks we
        // triggered ourselves via addColorToSite/removeColorFromSite -
        // those buttons live outside wrapper/dropdown by necessity)
        document.addEventListener('click', function(e) {
            if (suppressOutsideClose) return;
            if (!wrapper.contains(e.target) && !dropdown.contains(e.target)) {
                hideDropdown();
            }
        });

        // Hide dropdown on Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                hideDropdown();
            }
        });

        // Assemble components
        dropdown.appendChild(searchInput);
        dropdown.appendChild(colorList);
        wrapper.appendChild(dropdownBtn);
        wrapper.appendChild(dropdown);

        // Style the original input
        input.style.paddingRight = '35px';

        console.log('Enhanced input with dropdown');
    }

    // Find and enhance inputs
    function findAndEnhanceInputs() {
        const inputs = document.querySelectorAll(`${INPUT_SELECTOR}:not([data-enhanced])`);
        inputs.forEach(enhanceInput);
        if (inputs.length > 0) {
            console.log(`Enhanced ${inputs.length} input(s) with dropdown`);
        }
    }

    // Observer for dynamic content (the color-add UI is part of a slideout
    // panel that gets created/destroyed as the user opens/closes locations)
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                    if (node.matches && node.matches(INPUT_SELECTOR) && !node.dataset.enhanced) {
                        enhanceInput(node);
                    }
                    const childInputs = node.querySelectorAll ?
                        node.querySelectorAll(`${INPUT_SELECTOR}:not([data-enhanced])`) : [];
                    childInputs.forEach(enhanceInput);
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    findAndEnhanceInputs();
    setInterval(findAndEnhanceInputs, 3000);
})();