
import { Platform, JavaVersion, PluginSettings, BuildSystem } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
  name: "MeuPluginIncrivel",
  groupId: "com.exemplo",
  artifactId: "meu-plugin-incrivel",
  version: "1.0-SNAPSHOT",
  platform: Platform.PAPER,
  mcVersion: "1.20.4",
  javaVersion: JavaVersion.JAVA_17,
  buildSystem: BuildSystem.MAVEN,
  description: "Um plugin legal gerado por IA.",
  author: "MineGenAI",
  aiModel: "gpt-oss-120b", // Updated per request
  aiUrl: "https://api.siliconflow.cn/v1", // Updated to SiliconFlow default
  apiKey: "", // Custom API Key
  enableSounds: true,
  enableTTS: true 
};

export const MC_VERSIONS = [
  "1.21.x", "1.20.6", "1.20.4", "1.20.1", 
  "1.19.4", "1.18.2", "1.17.1", "1.16.5", 
  "1.12.2", "1.8.8"
];

// Prompt Tipo C: Context, Content, Constraints (Full Maven/Gradle Focus + Agent Capability)
export const SYSTEM_INSTRUCTION = `
# CONTEXT (CONTEXTO)
Você é um Arquiteto de Software Sênior e Agente de IA especializado no ecossistema Minecraft (Spigot, Paper, Velocity, BungeeCord).
Você tem acesso total de LEITURA e ESCRITA a uma pasta local do usuário.
Você frequentemente trabalhará em **Projetos Open Source Existentes**.

# OBJETIVOS
1. Criar novos projetos do zero quando a pasta estiver vazia.
2. **Manter, Refatorar ou Adicionar Funcionalidades** a projetos existentes (Legacy ou Open Source).

# CONSTRAINTS (RESTRIÇÕES RÍGIDAS)
1. **Preservação de Código (CRÍTICO)**:
   - **NUNCA remova headers de licença** (MIT, GPL, Apache, etc.) ou comentários de autoria existentes no topo dos arquivos.
   - Não altere a formatação ou estilo de código do projeto original sem solicitação explícita.
   - Se o arquivo não precisar de alterações lógicas, NÃO o inclua na resposta.

2. **Sistema de Build**:
   - Respeite estritamente o sistema existente (Maven ou Gradle).
   - Se encontrar um \`pom.xml\`, mantenha-se no Maven. Se encontrar \`build.gradle\`, mantenha-se no Gradle.
   - Ao adicionar dependências, tente usar as versões mais recentes compatíveis com a versão do Java detectada.

3. **Integridade**:
   - Ao modificar um arquivo, retorne o **CONTEÚDO COMPLETO** do arquivo modificado. Não use placeholders como "// ... resto do código".
   - Garanta que imports não utilizados sejam removidos, mas imports essenciais não sejam quebrados.

4. **Detecção de Plataforma**:
   - Se o código existente usa importações \`org.bukkit\`, trate como Spigot/Paper.
   - Se usa \`com.velocitypowered\`, trate como Velocity.
   - Se usa \`net.md_5.bungee\`, trate como BungeeCord.

# ESTRUTURA DO JSON (RESPOSTA)
{
  "explanation": "Explicação técnica do que foi alterado. Cite se preservou licenças.",
  "files": [
    {
      "path": "pom.xml", 
      "content": "...",
      "language": "xml"
    },
    {
      "path": "src/main/java/com/exemplo/Main.java",
      "content": "...",
      "language": "java"
    }
  ]
}
`;

// --- GRADLE WRAPPER TEMPLATES ---

export const GRADLE_WRAPPER_PROPERTIES = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.5-bin.zip
networkTimeout=10000
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;

// Updated with auto-download logic for gradle-wrapper.jar
export const GRADLEW_UNIX = `#!/bin/sh
#
# Copyright 2015 the original author or authors.
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

PRG="$0"

# Need this for relative symlinks.
while [ -h "$PRG" ] ; do
    ls=\`ls -ld "$PRG"\`
    link=\`expr "$ls" : '.*-> \\(.*\\)$'\`
    if expr "$link" : '/.*' > /dev/null; then
        PRG="$link"
    else
        PRG=\`dirname "$PRG"\`/"$link"
    fi
done

SAVED=" \`pwd\`"
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

# --- MINEGEN FIX: Download wrapper jar if missing ---
if [ ! -f "$CLASSPATH" ]; then
    echo "MineGen: Gradle Wrapper JAR not found. Downloading..."
    mkdir -p "$APP_HOME/gradle/wrapper"
    JAR_URL="https://raw.githubusercontent.com/gradle/gradle/v8.5.0/gradle/wrapper/gradle-wrapper.jar"
    if command -v curl >/dev/null 2>&1; then
        curl -L -o "$CLASSPATH" "$JAR_URL"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$CLASSPATH" "$JAR_URL"
    else
        echo "Error: curl or wget not found. Cannot download gradle-wrapper.jar."
        exit 1
    fi
fi
# ----------------------------------------------------

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

# For Cygwin, switch paths to Windows format before running java
if $cygwin ; then
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
        i=$((i+1))
    done
    case $i in
        (0) set -- ;;
        (1) set -- "$args0" ;;
        (2) set -- "$args0" "$args1" ;;
        (3) set -- "$args0" "$args1" "$args2" ;;
        (4) set -- "$args0" "$args1" "$args2" ;;
        (5) set -- "$args0" "$args1" "$args2" "$args3" ;;
        (6) set -- "$args0" "$args1" "$args2" "$args3" "$args4" ;;
        (7) set -- "$args0" "$args1" "$args2" "$args3" "$args4" "$args5" "$args6" ;;
        (8) set -- "$args0" "$args1" "$args2" "$args3" "$args4" "$args5" "$args6" "$args7" ;;
        (9) set -- "$args0" "$args1" "$args2" "$args3" "$args4" "$args5" "$args6" "$args7" "$args8" ;;
    esac
fi

# Escape application args
save () {
    for i do printf %s\\\\n "$i" | sed "s/'/'\\\\\\\\''/g;1s/^/'/;\$s/\$/' \\\\\\\\/" ; done
    echo " "
}
APP_ARGS=\$(save "\$@")

# Collect all arguments for the java command, following the shell quoting and substitution rules
eval set -- $DEFAULT_JVM_OPTS $JAVA_OPTS $GRADLE_OPTS "\\"-Dorg.gradle.appname=$APP_BASE_NAME\\"" -classpath "\\"$CLASSPATH\\"" org.gradle.wrapper.GradleWrapperMain "$APP_ARGS"

exec "$JAVACMD" "$@"
`;

// Updated with auto-download logic for gradle-wrapper.jar
export const GRADLEW_BAT = `@if "%DEBUG%" == "" @echo off
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
if "%ERRORLEVEL%" == "0" goto init

echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
echo.
goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto init

echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.
echo.
goto fail

:init
@rem Get command-line arguments, handling Windows variants

if not "%OS%" == "Windows_NT" goto win9xME_args

:win9xME_args
@rem Slurp the command line arguments.
set CMD_LINE_ARGS=
set _SKIP=2

:win9xME_args_slurp
if "x%~1" == "x" goto execute

set CMD_LINE_ARGS=%*

:execute
@rem Setup the command line

set CLASSPATH=%APP_HOME%\\gradle\\wrapper\\gradle-wrapper.jar

@rem --- MINEGEN FIX: Download wrapper jar if missing ---
if exist "%CLASSPATH%" goto startGradle
echo MineGen: Gradle Wrapper JAR not found. Downloading...
if not exist "%APP_HOME%\\gradle\\wrapper" mkdir "%APP_HOME%\\gradle\\wrapper"
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://raw.githubusercontent.com/gradle/gradle/v8.5.0/gradle/wrapper/gradle-wrapper.jar', '%CLASSPATH%')"
if not exist "%CLASSPATH%" (
    echo Error: Failed to download gradle-wrapper.jar
    goto fail
)
@rem ----------------------------------------------------

:startGradle
@rem Execute Gradle
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %CMD_LINE_ARGS%

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
