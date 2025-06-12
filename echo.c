#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <signal.h>
#include <pthread.h>
#include <errno.h>
#include <fcntl.h>

#define BUFFER_SIZE 1024

// Global variables for cleanup
int in_socket = -1;
int out_socket = -1;
int in_client = -1;
int out_client = -1;
pthread_t in_thread, out_thread;
int running = 1;

// Function to print buffer in hex format
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

// Signal handler for clean termination
void handle_signal(int sig) {
    printf("\nReceived signal %d. Cleaning up and exiting...\n", sig);
    running = 0;
    
    // Close all connections
    if (in_client != -1) close(in_client);
    if (out_client != -1) close(out_client);
    if (in_socket != -1) close(in_socket);
    if (out_socket != -1) close(out_socket);
    
    exit(0);
}

// Set socket to non-blocking mode
int set_nonblocking(int sock) {
    int flags = fcntl(sock, F_GETFL, 0);
    if (flags == -1) {
        perror("fcntl F_GETFL");
        return -1;
    }
    
    if (fcntl(sock, F_SETFL, flags | O_NONBLOCK) == -1) {
        perror("fcntl F_SETFL O_NONBLOCK");
        return -1;
    }
    
    return 0;
}

// Thread function to handle incoming data on the IN port
void* handle_in_connection(void* arg) {
    char buffer[BUFFER_SIZE];
    ssize_t bytes_received;
    
    while (running) {
        // Accept connection on IN port if not already connected
        if (in_client == -1) {
            struct sockaddr_in client_addr;
            socklen_t client_addr_len = sizeof(client_addr);
            
            printf("[IN] Waiting for a connection on port 9002...\n");
            in_client = accept(in_socket, (struct sockaddr*)&client_addr, &client_addr_len);
            
            if (in_client < 0) {
                if (errno != EINTR && errno != EAGAIN && errno != EWOULDBLOCK) {
                    perror("❌ [IN] Accept failed");
                }
                sleep(1);
                continue;
            }
            
            char client_ip[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &client_addr.sin_addr, client_ip, sizeof(client_ip));
            printf("✅ [IN] Client connected: %s:%d\n", client_ip, ntohs(client_addr.sin_port));
            
            // Set client socket to non-blocking
            set_nonblocking(in_client);
        }
        
        // Receive data from IN client
        bytes_received = recv(in_client, buffer, BUFFER_SIZE, 0);
        
        if (bytes_received > 0) {
            printf("📩 [IN] Received data (%ld bytes): ", bytes_received);
            print_hex(buffer, bytes_received);
            
            // Check if OUT client is connected
            if (out_client != -1) {
                // Forward data to OUT client
                if (send(out_client, buffer, bytes_received, 0) != bytes_received) {
                    perror("❌ [OUT] Send failed");
                } else {
                    printf("📤 Forwarded %ld bytes from IN to OUT\n", bytes_received);
                }
            } else {
                printf("⚠️ OUT client not connected, buffering data...\n");
            }
        } else if (bytes_received == 0) {
            printf("[IN] Client disconnected\n");
            close(in_client);
            in_client = -1;
        } else {
            if (errno != EAGAIN && errno != EWOULDBLOCK) {
                perror("❌ [IN] Receive failed");
                close(in_client);
                in_client = -1;
            }
        }
        
        usleep(10000); // Small delay to prevent CPU spinning (10ms)
    }
    
    return NULL;
}

// Thread function to handle incoming data on the OUT port
void* handle_out_connection(void* arg) {
    char buffer[BUFFER_SIZE];
    ssize_t bytes_received;
    
    while (running) {
        // Accept connection on OUT port if not already connected
        if (out_client == -1) {
            struct sockaddr_in client_addr;
            socklen_t client_addr_len = sizeof(client_addr);
            
            printf("[OUT] Waiting for a connection on port 9001...\n");
            out_client = accept(out_socket, (struct sockaddr*)&client_addr, &client_addr_len);
            
            if (out_client < 0) {
                if (errno != EINTR && errno != EAGAIN && errno != EWOULDBLOCK) {
                    perror("❌ [OUT] Accept failed");
                }
                sleep(1);
                continue;
            }
            
            char client_ip[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &client_addr.sin_addr, client_ip, sizeof(client_ip));
            printf("✅ [OUT] Client connected: %s:%d\n", client_ip, ntohs(client_addr.sin_port));
            
            // Set client socket to non-blocking
            set_nonblocking(out_client);
        }
        
        // Receive data from OUT client
        bytes_received = recv(out_client, buffer, BUFFER_SIZE, 0);
        
        if (bytes_received > 0) {
            printf("📩 [OUT] Received data (%ld bytes): ", bytes_received);
            print_hex(buffer, bytes_received);
            
            // Check if IN client is connected
            if (in_client != -1) {
                // Forward data to IN client
                if (send(in_client, buffer, bytes_received, 0) != bytes_received) {
                    perror("❌ [IN] Send failed");
                } else {
                    printf("📤 Forwarded %ld bytes from OUT to IN\n", bytes_received);
                }
            } else {
                printf("⚠️ IN client not connected, buffering data...\n");
            }
        } else if (bytes_received == 0) {
            printf("[OUT] Client disconnected\n");
            close(out_client);
            out_client = -1;
        } else {
            if (errno != EAGAIN && errno != EWOULDBLOCK) {
                perror("❌ [OUT] Receive failed");
                close(out_client);
                out_client = -1;
            }
        }
        
        usleep(10000); // Small delay to prevent CPU spinning (10ms)
    }
    
    return NULL;
}

int setup_server_socket(int port) {
    int server_socket;
    struct sockaddr_in server_addr;
    
    // Create socket
    server_socket = socket(AF_INET, SOCK_STREAM, 0);
    if (server_socket < 0) {
        perror("❌ Socket creation failed");
        return -1;
    }
    
    // Set socket option to reuse address
    int opt = 1;
    if (setsockopt(server_socket, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("❌ setsockopt failed");
        close(server_socket);
        return -1;
    }
    
    // Set socket to non-blocking
    set_nonblocking(server_socket);
    
    // Configure server address
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(port);
    
    // Bind socket
    if (bind(server_socket, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        perror("❌ Bind failed");
        close(server_socket);
        return -1;
    }
    
    // Listen for connections
    if (listen(server_socket, 5) < 0) {
        perror("❌ Listen failed");
        close(server_socket);
        return -1;
    }
    
    return server_socket;
}

int main(int argc, char *argv[]) {
    // These port numbers match the .env file configuration
    int in_port = 9002;  // Matches OUT_SERVER_PORT in .env
    int out_port = 9001; // Matches IN_SERVER_PORT in .env
    
    // Allow overriding via command line if needed
    if (argc == 3) {
        in_port = atoi(argv[1]);
        out_port = atoi(argv[2]);
    } else if (argc != 1) {
        printf("Usage: %s [in_port out_port]\n", argv[0]);
        printf("Default: Using in_port=9002, out_port=9001 (matching .env file)\n");
        return 1;
    }
    
    // Set up signal handling for graceful termination
    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);
    
    // Set up IN server socket
    in_socket = setup_server_socket(in_port);
    if (in_socket < 0) {
        return 1;
    }
    
    // Set up OUT server socket
    out_socket = setup_server_socket(out_port);
    if (out_socket < 0) {
        close(in_socket);
        return 1;
    }
    
    printf("🚀 Dual TCP Echo Server running\n");
    printf("📥 IN port: %d (WebSocket proxy's IN_SERVER_PORT)\n", in_port);
    printf("📤 OUT port: %d (WebSocket proxy's OUT_SERVER_PORT)\n", out_port);
    printf("Press Ctrl+C to terminate the server\n");
    
    // Create threads to handle connections
    pthread_create(&in_thread, NULL, handle_in_connection, NULL);
    pthread_create(&out_thread, NULL, handle_out_connection, NULL);
    
    // Wait for threads to complete (they won't unless we're shutting down)
    pthread_join(in_thread, NULL);
    pthread_join(out_thread, NULL);
    
    // Cleanup (we should never get here due to signal handler)
    if (in_client != -1) close(in_client);
    if (out_client != -1) close(out_client);
    if (in_socket != -1) close(in_socket);
    if (out_socket != -1) close(out_socket);
    
    return 0;
}
