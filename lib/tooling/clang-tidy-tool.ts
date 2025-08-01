// Copyright (c) 2018, Compiler Explorer Authors
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

import fs from 'node:fs/promises';
import path from 'node:path';

import {splitArguments} from '../../shared/common-utils.js';
import {CompilationInfo} from '../../types/compilation/compilation.interfaces.js';
import {ToolInfo} from '../../types/tool.interfaces.js';
import {OptionsHandlerLibrary} from '../options-handler.js';

import {ToolEnv} from './base-tool.interface.js';
import {BaseTool} from './base-tool.js';

export class ClangTidyTool extends BaseTool {
    static get key() {
        return 'clang-tidy-tool';
    }

    constructor(toolInfo: ToolInfo, env: ToolEnv) {
        super(toolInfo, env);

        this.addOptionsToToolArgs = false;
    }

    override async runTool(
        compilationInfo: CompilationInfo,
        inputFilepath: string,
        args?: string[],
        stdin?: string,
        supportedLibraries?: Record<string, OptionsHandlerLibrary>,
    ) {
        const sourcefile = inputFilepath;
        const options = compilationInfo.options;
        const dir = path.dirname(sourcefile);
        const includeflags = super.getIncludeArguments(compilationInfo.libraries, supportedLibraries || {});
        const libOptions = super.getLibraryOptions(compilationInfo.libraries, supportedLibraries || {});

        let source = '';
        args = args || [];
        const wantsFix = args.find(option => option.includes('-fix'));
        if (wantsFix) {
            args = args.filter(option => !option.includes('-header-filter='));

            source = await fs.readFile(sourcefile, 'utf-8');
        }

        // order should be:
        //  1) options from the compiler config (compilationInfo.compiler.options)
        //  2) includes from the libraries (includeflags)
        //  ?) options from the tool config (this.tool.options)
        //     -> before my patchup this was done only for non-clang compilers
        //  3) options manually specified in the compiler tab (options)
        //  *) indepenent are `args` from the clang-tidy tab
        let compileFlags = splitArguments(compilationInfo.compiler.options);
        compileFlags = compileFlags.concat(includeflags);
        compileFlags = compileFlags.concat(libOptions);

        const manualCompileFlags = options.filter(option => option !== sourcefile);
        compileFlags = compileFlags.concat(manualCompileFlags);
        compileFlags = compileFlags.concat(this.tool.options);

        // TODO: do we want compile_flags.txt rather than prefixing everything with -extra-arg=
        await fs.writeFile(path.join(dir, 'compile_flags.txt'), compileFlags.join('\n'));
        const result = await super.runTool(compilationInfo, sourcefile, args);
        result.sourcechanged = false;

        if (wantsFix) {
            const data = await fs.readFile(sourcefile);
            const newSource = data.toString();
            if (newSource !== source) {
                result.sourcechanged = true;
                result.newsource = newSource;
            }
        }

        return result;
    }
}
