cmake_minimum_required(VERSION 3.10)
project(WebSocketServer C)

include(FetchContent)

# Automatically download and build libwebsockets
FetchContent_Declare(
    libwebsockets
    GIT_REPOSITORY https://github.com/warmcat/libwebsockets.git
    GIT_TAG v4.3.3 # Change to latest version if needed
)

FetchContent_MakeAvailable(libwebsockets)

# Define the executable
add_executable(websocket_server src/main.c)

# Include libwebsockets headers
target_include_directories(websocket_server PRIVATE ${libwebsockets_SOURCE_DIR}/include)

# Link against libwebsockets
target_link_libraries(websocket_server PRIVATE websockets)
