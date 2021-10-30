// Copyright (c) 2021, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import { options } from './options';
import * as local from './local';

const FAV_LIBS_STORE_KEY = 'favlibs';

interface WidgetState {
    libs?: {id?: string, name?: string, ver?: string, version?: string}[];
}

interface LibraryVersion {
    version: string;
    hidden: boolean;
    used: boolean;
    alias?: string[];
}

type LibraryVersions = {[versionId: string]: LibraryVersion};

interface Library {
    name: string;
    description?: string;
    url?: string;
    versions: LibraryVersions;
    examples?: string[];
}

type CompilerLibs = {[libId: string]: Library};
type LanguageLibs = {[compilerId: string]: CompilerLibs};
type AvailableLibs = {[langId: string]: LanguageLibs};

type FavLibraries = {[libId: string]: string[]};

export class Widget {
    private domRoot: JQuery<HTMLElement>;

    private currentLangId: string;
    private currentCompilerId: string;

    private dropdownButton: JQuery<HTMLElement>;
    private searchResults: JQuery<HTMLElement>;

    private readonly onChangeCallback: () => void;

    private availableLibs: AvailableLibs;


    constructor(langId: string, compiler: any, dropdownButton: JQuery<HTMLElement>, state: WidgetState, onChangeCallback: () => void, possibleLibs: CompilerLibs) {
        this.dropdownButton = dropdownButton;
        if (compiler) {
            this.currentCompilerId = compiler.id;
        } else {
            this.currentCompilerId = '_default_';
        }
        this.currentLangId = langId;
        this.domRoot = $('#library-selection').clone(true);
        this.initButtons();
        this.onChangeCallback = onChangeCallback;
        this.availableLibs = {};
        this.updateAvailableLibs(possibleLibs);
        this.loadState(state);

        this.fullRefresh();

        const searchInput = this.domRoot.find('.lib-search-input');

        if (window.compilerExplorerOptions.mobileViewer) {
            this.domRoot.addClass('mobile');
        }

        this.domRoot.on('shown.bs.modal', () => {
            searchInput.trigger('focus');
        });

        searchInput.on('input', this.startSearching.bind(this));

        this.domRoot.find('.lib-search-button')
            .on('click', this.startSearching.bind(this));

        this.dropdownButton.on('click', () => {
            this.domRoot.modal({});
        });

        this.updateButton();
    }

    onChange() {
        this.updateButton();
        this.onChangeCallback();
    }

    loadState(state: WidgetState) {
        if (!state) return;
        for (let lib of state.libs ?? []) {
            if (lib.name && lib.ver) {
                this.markLibrary(lib.name, lib.ver, true);
            } else {
                this.markLibrary(lib.id, lib.version, true);
            }
        }
    }

    initButtons() {
        this.searchResults = this.domRoot.find('.lib-results-items');
    }

    fullRefresh() {
        this.showSelectedLibs();
        this.showSelectedLibsAsSearchResults();
        this.showFavorites();
    }

    updateButton() {
        const selectedLibs = this.get();
        let text = 'Libraries';
        if (selectedLibs.length > 0) {
            // TEST
            this.dropdownButton
                .addClass('btn-success')
                .removeClass('btn-light')
                .prop('title', 'Current libraries:\n' +
                    selectedLibs.map(lib => '- ' + lib.name).join('\n'));
            text = text + ' (' + selectedLibs.length + ')';
        } else {
            this.dropdownButton
                .removeClass('btn-success')
                .addClass('btn-light')
                .prop('title', 'Include libs');
        }

        this.dropdownButton.find('.dp-text').text(text);
    }

    getFavorites(): FavLibraries {
        return JSON.parse(local.get(FAV_LIBS_STORE_KEY, '{}'));
    }

    setFavorites(faves: FavLibraries) {
        local.set(FAV_LIBS_STORE_KEY, JSON.stringify(faves));
    }

    isAFavorite(libId: string, versionId: string): boolean {
        const faves = this.getFavorites();
        if (faves[libId]) {
            return faves[libId].includes(versionId);
        }

        return false;
    }

    addToFavorites(libId: string, versionId: string) {
        const faves = this.getFavorites();
        if (faves[libId]) {
            faves[libId].push(versionId);
        } else {
            faves[libId] = [];
            faves[libId].push(versionId);
        }

        this.setFavorites(faves);
    }

    // TEST
    removeFromFavorites(libId: string, versionId: string) {
        const faves = this.getFavorites();
        if (faves[libId]) {
            faves[libId] = faves[libId].filter(v => v !== versionId);
        }

        this.setFavorites(faves);
    }

    newFavoriteLibDiv(libId: string, versionId: string, lib: Library, version: LibraryVersion): JQuery<Node> {
        const template = $('#lib-favorite-tpl');

        const libDiv = $(template.children()[0].cloneNode(true));

        const quickSelectButton = libDiv.find('.lib-name-and-version');
        quickSelectButton.html(lib.name + ' ' + version.version);
        quickSelectButton.on('click', () => {
            this.selectLibAndVersion(libId, versionId);
            this.showSelectedLibs();
            this.onChange();
        });

        return libDiv;
    }

    showFavorites() {
        const favoritesDiv = this.domRoot.find('.lib-favorites');
        favoritesDiv.html('');

        const faves = this.getFavorites();
        for (let libId in faves) {
            const versionArr = faves[libId];
            for (let versionId of versionArr) {
                const lib = this.getLibInfoById(libId);
                if (lib) {
                    const version = lib.versions[versionId];
                    if (version) {
                        // TEST
                        const div: any = this.newFavoriteLibDiv(libId, versionId, lib, version);
                        favoritesDiv.append(div);
                    }
                }
            }
        }
    }

    clearSearchResults() {
        this.searchResults.html('');
    }

    newSelectedLibDiv(libId: string, versionId: string, lib: Library, version: LibraryVersion): JQuery<Node> {
        const template = $('#lib-selected-tpl');

        const libDiv = $(template.children()[0].cloneNode(true));

        const detailsButton = libDiv.find('.lib-name-and-version');
        detailsButton.html(lib.name + ' ' + version.version);
        detailsButton.on('click', () => {
            this.clearSearchResults();
            this.addSearchResult(libId, lib);
        });

        const deleteButton = libDiv.find('.lib-remove');
        deleteButton.on('click', () => {
            this.markLibrary(libId, versionId, false);
            libDiv.remove();
            this.showSelectedLibs();
            this.onChange();
            // We need to refresh the library lists, or the selector will still show up with the old library version
            this.startSearching();
        });

        return libDiv;
    }

    conjureUpExamples(result: JQuery<Node>, lib: Library) {
        const examples = result.find('.lib-examples');
        if (lib.examples && lib.examples.length > 0) {
            examples.append($('<b>Examples</b>'));
            const examplesList = $('<ul />');
            for (let exampleId of lib.examples) {
                const li = $('<li />');
                examplesList.append(li);
                const exampleLink = $('<a>Example</a>');
                exampleLink.attr('href', `${window.httpRoot}z/${exampleId}`);
                exampleLink.attr('target', '_blank');
                exampleLink.attr('rel', 'noopener');
                li.append(exampleLink);
            }
            examples.append(examplesList);
        }
    }

    newSearchResult(libId: string, lib: Library): JQuery<Node> {
        const template = $('#lib-search-result-tpl');

        const result = $($(template.children()[0].cloneNode(true)));
        result.find('.lib-name').html(lib.name);
        if (!lib.description) {
            result.find('.lib-description').hide();
        } else {
            result.find('.lib-description').html(lib.description);
        }
        result.find('.lib-website-link').attr('href', lib.url ?? '#');

        this.conjureUpExamples(result, lib);

        const faveButton = result.find('.lib-fav-button');
        const faveStar = faveButton.find('.lib-fav-btn-icon');
        faveButton.hide();

        const versions = result.find('.lib-version-select');
        versions.html('');
        const noVersionSelectedOption = $('<option value="">-</option>');
        versions.append(noVersionSelectedOption);
        let hasVisibleVersions = false;

        for (let versionId in lib.versions) {
            const version = lib.versions[versionId];
            const option = $('<option>');
            if (version.used) {
                option.attr('selected', 'selected');

                if (this.isAFavorite(libId, versionId)) {
                    faveStar.removeClass('far').addClass('fas');
                }

                faveButton.show();
            }
            option.attr('value', versionId);
            option.html(version.version);
            if (version.used || !version.hidden) {
                hasVisibleVersions = true;
                versions.append(option);
            }
        }

        if (!hasVisibleVersions) {
            noVersionSelectedOption.text('No available versions');
            versions.prop('disabled', true);
        }

        faveButton.on('click', () => {
            const option = versions.find('option:selected');
            const verId = option.attr('value');
            if (this.isAFavorite(libId, verId)) {
                this.removeFromFavorites(libId, verId);
                faveStar.removeClass('fas').addClass('far');
            } else {
                this.addToFavorites(libId, verId);
                faveStar.removeClass('far').addClass('fas');
            }
            this.showFavorites();
        });

        versions.on('change', () => {
            const option = versions.find('option:selected');
            const verId = option.attr('value');

            this.selectLibAndVersion(libId, verId);
            this.showSelectedLibs();

            if (this.isAFavorite(libId, verId)) {
                faveStar.removeClass('far').addClass('fas');
            } else {
                faveStar.removeClass('fas').addClass('far');
            }

            if (verId) {
                faveButton.show();
            } else {
                faveButton.hide();
            }

            this.onChange();
        });

        return result;
    }

    addSearchResult(libId: string, library: Library) {
        // Explain
        const result: any = this.newSearchResult(libId, library);
        this.searchResults.append(result);
    }

    startSearching() {
        const searchValue = this.domRoot.find('.lib-search-input').val();
        const lcSearchtext = searchValue.toString().toLowerCase();

        this.clearSearchResults();

        const currentAvailableLibs = this.availableLibs[this.currentLangId][this.currentCompilerId];
        if (Object.keys(currentAvailableLibs).length === 0) {
            const nolibsMessage: any = $($('#libs-dropdown').children()[0].cloneNode(true));
            this.searchResults.append(nolibsMessage);
            return;
        }

        for (let libId in currentAvailableLibs) {
            const library = currentAvailableLibs[libId];

            if (library.versions && library.versions.autodetect) break;

            if (library.name) {
                if (library.name.toLowerCase().includes(lcSearchtext)) {
                    this.addSearchResult(libId, library);
                    break;
                }
            }

            if (library.description) {
                if (library.description.toLowerCase().includes(lcSearchtext)) {
                    this.addSearchResult(libId, library);
                }
            }
        }
    }

    showSelectedLibs() {
        const items = this.domRoot.find('.libs-selected-items');
        items.html('');

        const selectedLibs = this.listUsedLibs();
        for (let libId in selectedLibs) {
            const versionId = selectedLibs[libId];

            const lib = this.availableLibs[this.currentLangId][this.currentCompilerId][libId];
            const version = lib.versions[versionId];

            const libDiv: any = this.newSelectedLibDiv(libId, versionId, lib, version);
            items.append(libDiv);
        }
    }

    showSelectedLibsAsSearchResults() {
        this.clearSearchResults();

        const currentAvailableLibs = this.availableLibs[this.currentLangId][this.currentCompilerId];
        if (Object.keys(currentAvailableLibs).length === 0) {
            const nolibsMessage: any = $($('#libs-dropdown').children()[0].cloneNode(true));
            this.searchResults.append(nolibsMessage);
            return;
        }


        for (let libId in currentAvailableLibs) {
            const library = currentAvailableLibs[libId];

            if (library.versions && library.versions.autodetect) return;

            const card: any = this.newSearchResult(libId, library);
            this.searchResults.append(card);
        }
    }

    initLangDefaultLibs() {
        const defaultLibs: string | null = options.defaultLibs[this.currentLangId];
        if (!defaultLibs) return;
        for (let libPair of defaultLibs.split(':')) {
            const pairSplits = libPair.split('.');
            if (pairSplits.length === 2) {
                const lib = pairSplits[0];
                const ver = pairSplits[1];
                this.markLibrary(lib, ver, true);
            }
        }
    }

    updateAvailableLibs(possibleLibs: CompilerLibs) {
        if (!this.availableLibs[this.currentLangId]) {
            this.availableLibs[this.currentLangId] = {};
        }

        if (!this.availableLibs[this.currentLangId][this.currentCompilerId]) {
            if (this.currentCompilerId === '_default_') {
                this.availableLibs[this.currentLangId][this.currentCompilerId] =
                    $.extend(true, {}, options.libs[this.currentLangId]);
            } else {
                this.availableLibs[this.currentLangId][this.currentCompilerId] =
                    $.extend(true, {}, possibleLibs);
            }
        }

        this.initLangDefaultLibs();
    }

    setNewLangId(langId: string, compilerId: string, possibleLibs: CompilerLibs) {
        const libsInUse = this.listUsedLibs();

        this.currentLangId = langId;

        if (compilerId) {
            this.currentCompilerId = compilerId;
        } else {
            this.currentCompilerId = '_default_';
        }

        // Clear the dom Root so it gets rebuilt with the new language libraries
        this.updateAvailableLibs(possibleLibs);

        // TEST
        for (let lib in libsInUse) {
            this.markLibrary(lib, libsInUse[lib], true);
        }

        this.fullRefresh();
        this.onChange();
    }

    getVersionOrAlias(name: string, version: string): string | null {
        // TEST
        const lib = this.getLibInfoById(name);
        if (!lib) return null;
        if (lib.versions[version] != null) {
            return version;
        } else {
            for (let verId in lib.versions) {
                const ver = lib.versions[verId];
                if (ver.alias && ver.alias.includes(version)) {
                    return verId;
                }
            }
            return null;
        }
    }

    getLibInfoById(libId: string): Library {
        // TEST
        return this.availableLibs[this.currentLangId]?.[this.currentCompilerId]?.[libId];
    };

    // Explain
    markLibrary(name: string, version: string, used: boolean) {
        const actualId = this.getVersionOrAlias(name, version);
        if (actualId != null) {
            const v = this.getLibInfoById(name)?.versions[actualId];
            if (v != null) {
                v.used = used;
            }
        }
    };

    selectLibAndVersion(libId: string, versionId: string) {
        this.markLibrary(libId, versionId, true);
    };

    get(): {name: string, ver: any}[] {
        const result = [];
        const usedLibs = this.listUsedLibs();
        for (let libId in usedLibs) {
            result.push({name: libId, ver: usedLibs[libId]});
        }
        return result;
    };

    listUsedLibs(): {[libId: string]: string} {
        const libs = {};
        const currentAvailableLibs = this.availableLibs[this.currentLangId][this.currentCompilerId];
        for (let libId in currentAvailableLibs) {
            const library = currentAvailableLibs[libId];
            for (let verId in library.versions) {
                if (library.versions[verId].used) {
                    libs[libId] = verId;
                }
            }
        }
        return libs;
    };

    getLibsInUse(): ({libId: string, versionId: string} & LibraryVersion)[] {
        const libs = [];
        const currentAvailableLibs = this.availableLibs[this.currentLangId][this.currentCompilerId];
        for (let libId in currentAvailableLibs) {
            const library = currentAvailableLibs[libId];
            for (let verId in library.versions) {
                if (library.versions[verId].used) {
                    // TEST
                    libs.push({...library.versions[verId], libId: libId, versionId: verId});
                }
            }
        }
        return libs;
    };
}
