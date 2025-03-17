#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <signal.h>
#include <libwebsockets.h>

#define BUFFER_SIZE 1024
#define RECONNECT_DELAY 2  // Reduced retry delay in seconds
#define TCP_POLL_MS 100    // How often to poll TCP sockets for data

// Per-session user data
struct per_session_data {
    struct lws *wsi;
    int active;
};

// Server context
struct server_context {
    int tcp_in_socket;    // Socket for input data
    int tcp_out_socket;   // Socket for output data
    char *in_server_ip;   // Input server IP
    int in_server_port;   // Input server port
    char *out_server_ip;  // Output server IP
    int out_server_port;  // Output server port
    int force_exit;       // Flag to force exit
    int retry_in;         // Retry counter for IN socket
    int retry_out;        // Retry counter for OUT socket
    struct lws_context *context;  // WebSocket context
};

// Global server context for signal handling
struct server_context *global_ctx = NULL;

// Log levels for libwebsockets
static int debug_level = LLL_ERR | LLL_WARN | LLL_NOTICE;

// Print buffer in hex format
static void print_hex(const char *buffer, int length) {
    if (length <= 0) {
        printf("Invalid length: %d\n", length);
        return;
    }
    
    for (int i = 0; i < length; i++) {
        printf("%02X ", (unsigned char)buffer[i]);
        if ((i + 1) % 16 == 0) printf("\n"); // Newline every 16 bytes
    }
    printf("\n");
}

// Set socket to non-blocking mode
static int set_socket_non_blocking(int sock) {
    int flags = fcntl(sock, F_GETFL, 0);
    if (flags < 0) {
        perror("❌ fcntl(F_GETFL) failed");
        return -1;
    }
    
    if (fcntl(sock, F_SETFL, flags | O_NONBLOCK) < 0) {
        perror("❌ fcntl(F_SETFL) failed");
        return -1;
    }
    
    return 0;
}

// Attempt to connect to a TCP server, without infinite retries
static int connect_to_tcp_server(const char *server_ip, int server_port, const char *label, int *retry_count) {
    int sock;
    struct sockaddr_in server_addr;
    
    // Check if we've already tried many times
    if (*retry_count > 10) {
        printf("⚠️ Too many failed connection attempts to %s TCP server. Will retry later.\n", label);
        *retry_count = 0;  // Reset counter, will try again in a bit
        return -1;
    }
    
    (*retry_count)++;  // Increment retry counter
    
    printf("Connecting to %s TCP server at: %s:%d (attempt %d)...\n", 
            label, server_ip, server_port, *retry_count);
    
    sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        perror("❌ Socket creation failed");
        return -1;
    }
    
    // Set socket to non-blocking mode
    if (set_socket_non_blocking(sock) < 0) {
        close(sock);
        return -1;
    }
    
    // Configure server address
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(server_port);
    if (inet_pton(AF_INET, server_ip, &server_addr.sin_addr) <= 0) {
        perror("❌ Invalid address");
        close(sock);
        return -1;
    }
    
    // Since we're non-blocking, connect will likely return immediately
    int res = connect(sock, (struct sockaddr*)&server_addr, sizeof(server_addr));
    if (res < 0) {
        if (errno == EINPROGRESS) {
            // Connection in progress - this is normal for non-blocking sockets
            fd_set wfds;
            struct timeval tv;
            
            FD_ZERO(&wfds);
            FD_SET(sock, &wfds);
            
            // Set timeout
            tv.tv_sec = 2;
            tv.tv_usec = 0;
            
            // Wait for socket to become writable (connection established)
            int select_res = select(sock + 1, NULL, &wfds, NULL, &tv);
            if (select_res <= 0) {
                if (select_res == 0) {
                    printf("❌ Connection to %s TCP server timed out\n", label);
                } else {
                    perror("❌ select() failed");
                }
                close(sock);
                return -1;
            }
            
            // Check if connection was successful
            int error = 0;
            socklen_t len = sizeof(error);
            if (getsockopt(sock, SOL_SOCKET, SO_ERROR, &error, &len) < 0 || error != 0) {
                if (error != 0) {
                    errno = error;
                }
                perror("❌ Connection failed after select");
                close(sock);
                return -1;
            }
        } else {
            perror("❌ Connect failed immediately");
            close(sock);
            return -1;
        }
    }
    
    // Connection successful
    printf("✅ Connected to %s TCP server %s:%d\n", label, server_ip, server_port);
    *retry_count = 0;  // Reset retry counter on success
    return sock;
}

// Signal handler for clean termination
static void sigint_handler(int sig) {
    printf("\nReceived signal %d. Cleaning up and exiting...\n", sig);
    if (global_ctx) {
        global_ctx->force_exit = 1;
        // Force lws_service to exit its loop
        if (global_ctx->context) {
            lws_cancel_service(global_ctx->context);
        }
    }
}

// WebSocket callback
static int websocket_callback(struct lws *wsi, enum lws_callback_reasons reason, 
                              void *user, void *in, size_t len) {
    struct per_session_data *pss = (struct per_session_data *)user;
    struct server_context *ctx = (struct server_context *)lws_context_user(lws_get_context(wsi));
    char buffer[BUFFER_SIZE + LWS_PRE];  // Add LWS_PRE for safety
    ssize_t received;
    
    switch (reason) {
        case LWS_CALLBACK_PROTOCOL_INIT:
            printf("WebSocket protocol initialized\n");
            break;
            
        case LWS_CALLBACK_ESTABLISHED:
            printf("✅ WebSocket connection established\n");
            pss->wsi = wsi;
            pss->active = 1;
            
            // Ensure TCP connections are established
            if (ctx->tcp_in_socket < 0) {
                ctx->tcp_in_socket = connect_to_tcp_server(
                    ctx->in_server_ip, ctx->in_server_port, "IN", &ctx->retry_in);
            }
            
            if (ctx->tcp_out_socket < 0) {
                ctx->tcp_out_socket = connect_to_tcp_server(
                    ctx->out_server_ip, ctx->out_server_port, "OUT", &ctx->retry_out);
            }
            
            // Request a callback when we can write (to check for data from TCP)
            lws_callback_on_writable(wsi);
            break;
            
        case LWS_CALLBACK_RECEIVE:
            if (!pss->active) return 0;
            
            // Handle incoming data from WebSocket client - send to TCP IN server
            if (ctx->tcp_in_socket < 0) {
                printf("⚠️ IN TCP connection lost. Reconnecting...\n");
                ctx->tcp_in_socket = connect_to_tcp_server(
                    ctx->in_server_ip, ctx->in_server_port, "IN", &ctx->retry_in);
                
                if (ctx->tcp_in_socket < 0) {
                    printf("⚠️ Failed to connect to IN TCP server. Will buffer or discard data.\n");
                    // In a production environment, you might want to buffer this data
                    // For now, just let the client know we couldn't process it
                    const char *error_msg = "Error: Cannot connect to TCP server";
                    unsigned char *out = (unsigned char *)(buffer + LWS_PRE);
                    strncpy((char *)out, error_msg, BUFFER_SIZE - LWS_PRE);
                    lws_write(wsi, out, strlen(error_msg), LWS_WRITE_TEXT);
                    return 0;
                }
            }
            
            // Send data to IN TCP server
            int bytes_sent = send(ctx->tcp_in_socket, in, len, 0);
            if (bytes_sent < 0) {
                perror("❌ Send to IN TCP server failed");
                close(ctx->tcp_in_socket);
                ctx->tcp_in_socket = -1;
                return 0;
            } else if (bytes_sent != len) {
                printf("⚠️ Partial send to IN TCP server: %d of %zu bytes\n", bytes_sent, len);
                // In a production environment, handle partial sends properly
            } else {
                printf("📤 Forwarded to IN TCP server: ");
                print_hex(in, len);
            }
            
            // Schedule a callback to check for TCP server response
            lws_callback_on_writable(wsi);
            break;
            
        case LWS_CALLBACK_SERVER_WRITEABLE:
            if (!pss->active) return 0;
            
            // Verify or establish OUT server connection
            if (ctx->tcp_out_socket < 0) {
                ctx->tcp_out_socket = connect_to_tcp_server(
                    ctx->out_server_ip, ctx->out_server_port, "OUT", &ctx->retry_out);
                
                if (ctx->tcp_out_socket < 0) {
                    // Couldn't connect, schedule another attempt
                    lws_callback_on_writable(wsi);
                    break;
                }
            }
            
            // Check for data from OUT TCP server
            received = recv(ctx->tcp_out_socket, buffer + LWS_PRE, sizeof(buffer) - LWS_PRE, MSG_DONTWAIT);
            
            if (received > 0) {
                // Successfully received data - forward to WebSocket client
                lws_write(wsi, (unsigned char *)(buffer + LWS_PRE), received, LWS_WRITE_BINARY);
                printf("📩 Received from OUT TCP server: ");
                print_hex(buffer + LWS_PRE, received);
            } else if (received == 0) {
                // Connection closed by server
                printf("⚠️ OUT TCP connection closed by server. Reconnecting...\n");
                close(ctx->tcp_out_socket);
                ctx->tcp_out_socket = -1;
            } else if (errno != EAGAIN && errno != EWOULDBLOCK) {
                // Error other than would-block
                perror("❌ Error reading from OUT TCP server");
                close(ctx->tcp_out_socket);
                ctx->tcp_out_socket = -1;
            }
            
            // Keep checking for more data periodically
            lws_callback_on_writable(wsi);
            break;
            
        case LWS_CALLBACK_CLOSED:
            printf("❌ WebSocket connection closed\n");
            if (pss) {
                pss->active = 0;
                pss->wsi = NULL;
            }
            break;
            
        default:
            break;
    }
    
    fflush(stdout);
    return 0;
}

// WebSocket protocol definition
static struct lws_protocols protocols[] = {
    { "websocket-to-tcp", websocket_callback, sizeof(struct per_session_data), BUFFER_SIZE },
    { NULL, NULL, 0, 0 }
};

void print_usage(const char *program_name) {
    printf("Usage: %s <websocket_port> <in_server_ip> <in_server_port> <out_server_ip> <out_server_port>\n", program_name);
    printf("Example: %s 8080 127.0.0.1 9002 127.0.0.1 9001\n", program_name);
}

int main(int argc, char *argv[]) {
    // Set up signal handling
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = sigint_handler;
    sigaction(SIGINT, &sa, NULL);
    sigaction(SIGTERM, &sa, NULL);
    
    // Check command line arguments
    if (argc != 6) {
        print_usage(argv[0]);
        return 1;
    }
    
    int websocket_port = atoi(argv[1]);
    char *in_server_ip = argv[2];
    int in_server_port = atoi(argv[3]);
    char *out_server_ip = argv[4];
    int out_server_port = atoi(argv[5]);
    
    // Validate arguments
    if (websocket_port <= 0 || in_server_port <= 0 || out_server_port <= 0) {
        fprintf(stderr, "Error: Invalid port numbers. Ports must be positive integers.\n");
        print_usage(argv[0]);
        return 1;
    }
    
    // Initialize server context
    struct server_context user_ctx;
    memset(&user_ctx, 0, sizeof(user_ctx));
    user_ctx.in_server_ip = in_server_ip;
    user_ctx.in_server_port = in_server_port;
    user_ctx.out_server_ip = out_server_ip;
    user_ctx.out_server_port = out_server_port;
    user_ctx.tcp_in_socket = -1;
    user_ctx.tcp_out_socket = -1;
    user_ctx.force_exit = 0;
    
    // Set global context for signal handling
    global_ctx = &user_ctx;
    
    // Set up libwebsockets logging
    lws_set_log_level(debug_level, NULL);
    
    // Initialize libwebsockets
    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));
    info.port = websocket_port;
    info.protocols = protocols;
    info.user = &user_ctx;
    info.gid = -1;
    info.uid = -1;
    
    // Add options to make server more robust
    info.options = LWS_SERVER_OPTION_HTTP_HEADERS_SECURITY_BEST_PRACTICES_ENFORCE |
                   LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT;
    
    // Create libwebsockets context
    user_ctx.context = lws_create_context(&info);
    if (!user_ctx.context) {
        fprintf(stderr, "❌ Failed to create WebSocket context\n");
        return -1;
    }
    
    printf("🚀 Dual WebSocket to TCP Proxy running on port %d...\n", websocket_port);
    printf("📥 IN server: %s:%d (using echo server's port 9002)\n", in_server_ip, in_server_port);
    printf("📤 OUT server: %s:%d (using echo server's port 9001)\n", out_server_ip, out_server_port);
    printf("Press Ctrl+C to terminate the server\n");
    
    // We'll attempt TCP connections after WebSocket clients connect
    // (This is a change from the original code)
    printf("TCP connections will be established when WebSocket clients connect.\n");
    
    // Do not reconnect to TCP servers initially in the main function
    
    // Poll loop
    while (!user_ctx.force_exit) {
        lws_service(user_ctx.context, TCP_POLL_MS);
        
        // Periodically try to reconnect TCP sockets if needed
        if (user_ctx.tcp_in_socket < 0) {
            user_ctx.tcp_in_socket = connect_to_tcp_server(
                in_server_ip, in_server_port, "IN", &user_ctx.retry_in);
        }
        
        if (user_ctx.tcp_out_socket < 0) {
            user_ctx.tcp_out_socket = connect_to_tcp_server(
                out_server_ip, out_server_port, "OUT", &user_ctx.retry_out);
        }
    }
    
    // Cleanup before exit
    printf("Cleaning up and exiting...\n");
    
    if (user_ctx.tcp_in_socket != -1) {
        close(user_ctx.tcp_in_socket);
    }
    
    if (user_ctx.tcp_out_socket != -1) {
        close(user_ctx.tcp_out_socket);
    }
    
    lws_context_destroy(user_ctx.context);
    printf("Goodbye!\n");
    
    return 0;
}