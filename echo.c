#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <signal.h>

#define PORT 9000
#define BUFFER_SIZE 1024

int server_fd = -1, client_fd = -1; // Global socket descriptors for cleanup

// Signal handler to ensure sockets are closed on shutdown
void handle_signal(int signal) {
    printf("\n⚠️  Caught signal %d, shutting down server...\n", signal);

    if (client_fd != -1) {
        close(client_fd);
        printf("✅ Client socket closed.\n");
    }

    if (server_fd != -1) {
        close(server_fd);
        printf("✅ Server socket closed.\n");
    }

    exit(0); // Exit cleanly
}

int main() {
    struct sockaddr_in server_addr, client_addr;
    socklen_t addr_len = sizeof(client_addr);
    char buffer[BUFFER_SIZE];

    // Set up signal handling for clean shutdown
    struct sigaction sa;
    sa.sa_handler = handle_signal;
    sa.sa_flags = 0;
    sigemptyset(&sa.sa_mask);
    sigaction(SIGINT, &sa, NULL);   // Handle Ctrl+C (SIGINT)
    sigaction(SIGTERM, &sa, NULL);  // Handle `kill` command (SIGTERM)

    // Create socket
    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == -1) {
        perror("Socket creation failed");
        exit(EXIT_FAILURE);
    }

    // Set server address
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY; // Listen on all interfaces
    server_addr.sin_port = htons(PORT);

    // Bind the socket
    if (bind(server_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        perror("Bind failed");
        close(server_fd);
        exit(EXIT_FAILURE);
    }

    // Start listening
    if (listen(server_fd, 5) < 0) {
        perror("Listen failed");
        close(server_fd);
        exit(EXIT_FAILURE);
    }

    printf("TCP Echo Server listening on port %d... (Press Ctrl+C to stop)\n", PORT);

    while (1) {  // Infinite loop to handle new clients
        printf("Waiting for a new client...\n");
        
        // Accept client connection
        client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &addr_len);
        if (client_fd < 0) {
            perror("Accept failed");
            continue;  // Keep waiting for new clients even if accept fails
        }

        printf("Client connected.\n");

        // Echo loop
        while (1) {
            ssize_t bytes_received = recv(client_fd, buffer, BUFFER_SIZE, 0);
            if (bytes_received <= 0) {
                printf("Client disconnected. Waiting for a new connection...\n");
                close(client_fd);
                break; // Exit loop and wait for a new client
            }

            // Echo the message back to the client
            send(client_fd, buffer, bytes_received, 0);
            printf("Echoed: %.*s\n", (int)bytes_received, buffer);
        }
    }

    // Close the server socket before exiting
    close(server_fd);
    printf("Server shutdown complete.\n");

    return 0;
}