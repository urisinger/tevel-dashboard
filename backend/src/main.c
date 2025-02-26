#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <libwebsockets.h>

#define TCP_SERVER_IP "127.0.0.1"  // Change this to your TCP server IP
#define TCP_SERVER_PORT 9000       // Change this to your TCP server port
#define WEBSOCKET_PORT 8080         // WebSocket listening port
#define BUFFER_SIZE 1024
#define RECONNECT_DELAY 5 // Retry delay in seconds

struct server_context {
    int tcp_socket;
};

#include <stdio.h>

// Print buffer in hex format
static void print_hex(const char *buffer, int length) {
    if (length <= 0) {
        printf("Invalid length: %d\n", length);
        return;
    }
    
    for (int i = 0; i < length; i++) {
        printf("%02X ", (unsigned char)buffer[i]); // Correctly print hex values

        if ((i + 1) % 16 == 0) printf("\n"); // Newline every 16 bytes
    }
    printf("\n");

}


// Attempt to connect to the TCP server, with retries on failure
static int connect_to_tcp_server() {
    int sock;
    struct sockaddr_in server_addr;

    while (1) {
        printf("Connecting to TCP server at: %s:%d...\n", TCP_SERVER_IP, TCP_SERVER_PORT);
        sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock < 0) {
            perror("❌ Socket creation failed");
            sleep(RECONNECT_DELAY);
            continue;
        }

        server_addr.sin_family = AF_INET;
        server_addr.sin_port = htons(TCP_SERVER_PORT);
        inet_pton(AF_INET, TCP_SERVER_IP, &server_addr.sin_addr);

        if (connect(sock, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
            perror("❌ TCP connection failed");
            close(sock);
            sleep(RECONNECT_DELAY);
            continue;
        }

        printf("✅ Connected to TCP server %s:%d\n", TCP_SERVER_IP, TCP_SERVER_PORT);
        return sock;
    }
}

// WebSocket callback
static int websocket_callback(struct lws *wsi, enum lws_callback_reasons reason, 
                              void *user, void *in, size_t len) {
    struct server_context *ctx = (struct server_context *)lws_context_user(lws_get_context(wsi));
    char buffer[BUFFER_SIZE];
    ssize_t received;

    switch (reason) {
        case LWS_CALLBACK_ESTABLISHED:
            printf("✅ WebSocket connection established\n");
            break;
        case LWS_CALLBACK_RECEIVE:
            if (ctx->tcp_socket < 0) {
                printf("⚠️ TCP connection lost. Reconnecting...\n");
                ctx->tcp_socket = connect_to_tcp_server();
            }
            if (ctx->tcp_socket > 0) {
                send(ctx->tcp_socket, in, len, 0);
                printf("Forwarded to TCP server: ");
                print_hex(in, len);
            }
            break;

        case LWS_CALLBACK_SERVER_WRITEABLE:
            if (ctx->tcp_socket > 0) {
                received = recv(ctx->tcp_socket, buffer, sizeof(buffer), MSG_DONTWAIT);
                if (received > 0) {
                    lws_write(wsi, (unsigned char *)buffer, received, LWS_WRITE_BINARY);
                    printf("📩 Received from TCP server: ");
                    print_hex(buffer, received);
                } else if (received == 0) {
                    printf("⚠️ TCP connection closed by server. Reconnecting...\n");
                    close(ctx->tcp_socket);
                    ctx->tcp_socket = -1;
                }
            }
            break;

        case LWS_CALLBACK_CLOSED:
            printf("❌ WebSocket connection closed\n");
            break;

        default:
            break;
    }

    fflush(stdout);

    return 0;
}

// WebSocket protocol definition
static struct lws_protocols protocols[] = {
    { "websocket-to-tcp", websocket_callback, 0, BUFFER_SIZE },
    { NULL, NULL, 0, 0 }
};

int main() {
    struct server_context user_ctx;
    user_ctx.tcp_socket = connect_to_tcp_server();

    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));
    info.port = WEBSOCKET_PORT;
    info.protocols = protocols;
    info.user = &user_ctx;

    struct lws_context *context = lws_create_context(&info);
    if (!context) {
        fprintf(stderr, "❌ Failed to create WebSocket context\n");
        return -1;
    }

    printf("🚀 WebSocket to TCP Proxy running on port %d...\n", WEBSOCKET_PORT);
    while (1) {
        lws_service(context, 1000);
        lws_callback_on_writable_all_protocol(context, &protocols[0]);
    }

    if (user_ctx.tcp_socket != -1) {
        close(user_ctx.tcp_socket);
    }
    lws_context_destroy(context);
    return 0;
}