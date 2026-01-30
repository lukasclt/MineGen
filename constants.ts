
import { Platform, JavaVersion, PluginSettings, BuildSystem, AIProvider } from './types';

export const OPENROUTER_MODELS = [];

export const GITHUB_COPILOT_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' }
];

export const DEFAULT_SETTINGS: PluginSettings = {
  name: "MeuPlugin",
  groupId: "com.exemplo",
  artifactId: "meu-plugin",
  version: "1.0.0",
  platform: Platform.PAPER,
  mcVersion: "1.20.4",
  javaVersion: JavaVersion.JAVA_17,
  buildSystem: BuildSystem.GRADLE, 
  aiProvider: AIProvider.GITHUB_COPILOT, 
  description: "Plugin gerado via MineGen AI",
  author: "MineGen",
  aiModel: 'gpt-4o', 
  aiUrl: 'https://models.inference.ai.azure.com', 
  enableSounds: true,
  enableTTS: false 
};

export const MC_VERSIONS = [
  "1.21.x", "1.20.6", "1.20.4", "1.20.1", 
  "1.19.4", "1.18.2", "1.16.5", "1.8.8"
];

// WORKFLOW OTIMIZADO: Build + Auto Release + Multi-Java Setup
export const getGithubWorkflowYml = (targetJavaVersion: string) => {
  const targetVersion = targetJavaVersion === '1.8' ? '8' : targetJavaVersion;
  
  // Lógica: Gradle 8+ precisa rodar no Java 17+.
  // Se o target for < 17 (ex: 8 ou 11), precisamos configurar o 17 pro Gradle e o Target pra compilação.
  // Se o target for >= 17, basta configurar o target.
  
  const setupJavaSteps = targetVersion === '17' || targetVersion === '21' 
    ? `
    - name: Configurar JDK ${targetVersion}
      uses: actions/setup-java@v4
      with:
        java-version: '${targetVersion}'
        distribution: 'temurin'
    `
    : `
    - name: Configurar JDK 17 (Gradle Runtime)
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'

    - name: Configurar JDK ${targetVersion} (Target Compilation)
      uses: actions/setup-java@v4
      with:
        java-version: '${targetVersion}'
        distribution: 'temurin'
    `;

  return `name: Build & Release

on:
  push:
    branches: [ "main", "master" ]
  workflow_dispatch:

permissions:
  contents: write # CRÍTICO: Permite criar Releases e Tags

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4
    ${setupJavaSteps}
        
    - name: Configurar Gradle
      uses: gradle/actions/setup-gradle@v3

    - name: Permissão de Execução Gradlew
      run: chmod +x gradlew

    - name: Compilar com Gradle
      run: ./gradlew build

    - name: Listar Arquivos (Debug)
      run: ls -R build/libs/

    - name: Criar Release Automática
      uses: softprops/action-gh-release@v1
      if: success()
      with:
        tag_name: v1.0.\${{ github.run_number }}
        name: Versão 1.0.\${{ github.run_number }}
        body: |
          Build automático gerado pelo MineGen AI.
          Commit: \${{ github.sha }}
        files: build/libs/*.jar
        draft: false
        prerelease: false
      env:
        GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;
};

export const SYSTEM_INSTRUCTION = `
# PERSONA
Você é um Arquiteto de Software Sênior especializado em Minecraft (Spigot/Paper/Velocity) brasileiro.
Seu objetivo é gerar código Java de produção, gerenciado via Gradle e GitHub.
Você fala EXCLUSIVAMENTE em Português do Brasil (pt-BR).

# REGRAS CRÍTICAS DE BUILD (IMPORTANTE)
Se o usuário reportar problemas de Build, CI/CD ou GitHub Actions, você DEVE VERIFICAR E CRIAR o arquivo \`.github/workflows/gradle.yml\` com o conteúdo abaixo. O GitHub Actions NÃO INICIA se este arquivo não existir ou se faltarem permissões.

TEMPLATE OBRIGATÓRIO PARA \`.github/workflows/gradle.yml\`:
\`\`\`yaml
name: Build & Release
on:
  push:
    branches: [ "main", "master" ]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Set up JDK 17 (Runtime)
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'
    # SE A VERSÃO DO PROJETO FOR DIFERENTE DE 17, ADICIONE OUTRO SETUP-JAVA AQUI
    - name: Setup Gradle
      uses: gradle/actions/setup-gradle@v3
    - name: Grant execute permission for gradlew
      run: chmod +x gradlew
    - name: Build with Gradle
      run: ./gradlew build
    - name: Release Artifacts
      uses: softprops/action-gh-release@v1
      if: success()
      with:
        tag_name: v1.0.\${{ github.run_number }}
        name: Versão 1.0.\${{ github.run_number }}
        files: build/libs/*.jar
        draft: false
        prerelease: false
      env:
        GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
\`\`\`

# REGRAS GERAIS
1. **Gradle Obrigatório**: Use Gradle (Groovy/Kotlin).
2. **Versão Java**: Configure 'build.gradle' (toolchain) para a versão correta.
3. **Comentários**: Escreva Javadoc e comentários em Português.
4. **Respostas**: Sempre explique o que foi feito em Português.

# FORMATO DE SAÍDA (JSON ESTRITO)
Estrutura:
{
  "explanation": "Explicação em Markdown (PT-BR).",
  "commitTitle": "fix: corrigir build",
  "commitDescription": "Adicionado workflow de build e release.",
  "files": [
    {
      "path": ".github/workflows/gradle.yml",
      "content": "CONTEUDO_DO_YAML",
      "language": "yaml"
    }
  ]
}
`;

// SCRIPT REAL DO GRADLE WRAPPER (UNIX)
export const GRADLEW_UNIX = `#!/bin/sh

#
# Copyright © 2015-2021 the original authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

##############################################################################
#
#   Gradle start up script for POSIX generated by Gradle.
#
##############################################################################

# Attempt to set APP_HOME
# Resolve links: $0 may be a link
PRG="$0"
# Need this for relative symlinks.
while [ -h "$PRG" ] ; do
    ls=\`ls -ld "$PRG"\`
    link=\`expr "$ls" : '.*-> \\(.*\\)$'\`
    if expr "$link" : '/.*' > /dev/null; then
        PRG="$link"
    else
        PRG=\`dirname "$PRG"\`"/$link"
    fi
done
SAVED="$\`pwd\`"
cd "\`dirname \\"$PRG\\"\`/" >/dev/null
APP_HOME="\`pwd -P\`"
cd "$SAVED" >/dev/null

APP_NAME="Gradle"
APP_BASE_NAME=\`basename "$0"\`

# Add default JVM options here. You can also use JAVA_OPTS and GRADLE_OPTS to pass JVM options to this script.
DEFAULT_JVM_OPTS=""

# Use the maximum available, or set MAX_FD != -1 to use that value.
MAX_FD="maximum"

warn () {
    echo "$*"
}

die () {
    echo
    echo "$*"
    echo
    exit 1
}

# OS specific support (must be 'true' or 'false').
cygwin=false
msys=false
darwin=false
nonstop=false
case "\`uname\`" in
  CYGWIN* )
    cygwin=true
    ;;
  Darwin* )
    darwin=true
    ;;
  MINGW* )
    msys=true
    ;;
  NONSTOP* )
    nonstop=true
    ;;
esac

CLASSPATH=$APP_HOME/gradle/wrapper/gradle-wrapper.jar

# Determine the Java command to use to start the JVM.
if [ -n "$JAVA_HOME" ] ; then
    if [ -x "$JAVA_HOME/jre/sh/java" ] ; then
        # IBM's JDK on AIX uses strange locations for the executables
        JAVACMD="$JAVA_HOME/jre/sh/java"
    else
        JAVACMD="$JAVA_HOME/bin/java"
    fi
    if [ ! -x "$JAVACMD" ] ; then
        die "ERROR: JAVA_HOME is set to an invalid directory: $JAVA_HOME

Please set the JAVA_HOME variable in your environment to match the
location of your Java installation."
    fi
else
    JAVACMD="java"
    which java >/dev/null 2>&1 || die "ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.

Please set the JAVA_HOME variable in your environment to match the
location of your Java installation."
fi

# Increase the maximum file descriptors if we can.
if [ "$cygwin" = "false" -a "$darwin" = "false" -a "$nonstop" = "false" ] ; then
    MAX_FD_LIMIT=\`ulimit -H -n\`
    if [ $? -eq 0 ] ; then
        if [ "$MAX_FD" = "maximum" -o "$MAX_FD" = "max" ] ; then
            MAX_FD="$MAX_FD_LIMIT"
        fi
        ulimit -n $MAX_FD
        if [ $? -ne 0 ] ; then
            warn "Could not set maximum file descriptor limit: $MAX_FD"
        fi
    else
        warn "Could not query maximum file descriptor limit: $MAX_FD_LIMIT"
    fi
fi

# For Darwin, add options to specify how the application appears in the dock
if $darwin; then
    GRADLE_OPTS="$GRADLE_OPTS \\"-Xdock:name=$APP_NAME\\" \\"-Xdock:icon=$APP_HOME/media/gradle.icns\\""
fi

# For Cygwin or MSYS, switch paths to Windows format before running java
if [ "$cygwin" = "true" -o "$msys" = "true" ] ; then
    APP_HOME=\`cygpath --path --mixed "$APP_HOME"\`
    CLASSPATH=\`cygpath --path --mixed "$CLASSPATH"\`
    JAVACMD=\`cygpath --unix "$JAVACMD"\`

    # We build the pattern for arguments to be converted via cygpath
    ROOTDIRSRAW=\`find -L / -maxdepth 1 -mindepth 1 -type d 2>/dev/null\`
    SEP=""
    for dir in $ROOTDIRSRAW ; do
        ROOTDIRS="$ROOTDIRS$SEP$dir"
        SEP="|"
    done
    OURCYGPATTERN="(^($ROOTDIRS))"
    # Add a user-defined pattern to the cygpath arguments
    if [ "$GRADLE_CYGPATTERN" != "" ] ; then
        OURCYGPATTERN="$OURCYGPATTERN|($GRADLE_CYGPATTERN)"
    fi
    # Now convert the arguments - kludge to limit ourselves to /bin/sh
    i=0
    for arg in "$@" ; do
        CHECK=\`echo "$arg"|egrep -c "$OURCYGPATTERN" - \`
        CHECK2=\`echo "$arg"|egrep -c "^-"\`                                 ### Determine if an option

        if [ $CHECK -ne 0 ] && [ $CHECK2 -eq 0 ] ; then                    ### Added a condition
            eval \`echo args$i\`=\`cygpath --path --ignore --mixed "$arg"\`
        else
            eval \`echo args$i\`="\\"$arg\\""
        fi
        i=\`expr $i + 1\`
    done
    case $i in
        0) set -- ;;
        1) set -- "$args0" ;;
        2) set -- "$args0" "$args1" ;;
        3) set -- "$args0" "$args1" "$args2" ;;
        4) set -- "$args0" "$args1" "$args2" "$args3" ;;
        5) set -- "$args0" "$args1" "$args2" "$args3" "$args4" ;;
        6) set -- "$args0" "$args1" "$args2" "$args3" "$args4" "$args5" ;;
        7) set -- "$args0" "$args1" "$args2" "$args3" "$args4" "$args5" "$args6" ;;
        8) set -- "$args0" "$args1" "$args2" "$args3" "$args4" "$args5" "$args6" "$args7" ;;
        9) set -- "$args0" "$args1" "$args2" "$args3" "$args4" "$args5" "$args6" "$args7" "$args8" ;;
    esac
fi

# Escape application args
save () {
    for i do printf %s\\n "$i" | sed "s/'/'\\\\''/g;1s/^/'/;\$s/\$/' \\\\/" ; done
    echo " "
}
APP_ARGS=\`save "$@"\`

# Collect all arguments for the java command, following the shell quoting and substitution rules
eval set -- $DEFAULT_JVM_OPTS $JAVA_OPTS $GRADLE_OPTS "\\"-Dorg.gradle.appname=$APP_BASE_NAME\\"" -classpath "\\"$CLASSPATH\\"" org.gradle.wrapper.GradleWrapperMain "$APP_ARGS"

exec "$JAVACMD" "$@"
`;

// SCRIPT REAL DO GRADLE WRAPPER (WINDOWS)
export const GRADLEW_BAT = `@rem
@rem Copyright 2015 the original author or authors.
@rem
@rem Licensed under the Apache License, Version 2.0 (the "License");
@rem you may not use this file except in compliance with the License.
@rem You may obtain a copy of the License at
@rem
@rem      https://www.apache.org/licenses/LICENSE-2.0
@rem
@rem Unless required by applicable law or agreed to in writing, software
@rem distributed under the License is distributed on an "AS IS" BASIS,
@rem WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
@rem See the License for the specific language governing permissions and
@rem limitations under the License.
@rem

@if "%DEBUG%" == "" @echo off
@rem ##########################################################################
@rem
@rem  Gradle startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%

@rem Add default JVM options here. You can also use JAVA_OPTS and GRADLE_OPTS to pass JVM options to this script.
set DEFAULT_JVM_OPTS=

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if "%ERRORLEVEL%" == "0" goto execute

echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto execute

echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:execute
@rem Setup the command line

set CLASSPATH=%APP_HOME%\\gradle\\wrapper\\gradle-wrapper.jar

@rem Execute Gradle
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*

:end
@rem End local scope for the variables with windows NT shell
if "%ERRORLEVEL%"=="0" goto mainEnd

:fail
rem Set variable GRADLE_EXIT_CONSOLE if you need the _script_ return code instead of
rem the _cmd.exe /c_ return code!
if  not "" == "%GRADLE_EXIT_CONSOLE%" exit 1
exit /b 1

:mainEnd
if "%OS%"=="Windows_NT" endlocal

:omega
`;

export const GRADLE_WRAPPER_PROPERTIES = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.5-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
