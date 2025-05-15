#!/bin/bash

# PostgreSQL setup functions for ShareThings

# Configure session storage
configure_session_storage() {
  echo -e "${BLUE}=== Session Storage Configuration ===${NC}"

  # Check if session storage type is provided as an argument
  if [ -n "$SESSION_STORAGE_TYPE_ARG" ]; then
    if [ "$SESSION_STORAGE_TYPE_ARG" = "postgresql" ]; then
      USE_POSTGRES="y"
      echo -e "${YELLOW}Using PostgreSQL for session storage (from argument).${NC}"
    else
      USE_POSTGRES="n"
      echo -e "${YELLOW}Using in-memory session storage (from argument).${NC}"
      
      # Update server/.env file with in-memory configuration
      if grep -q "SESSION_STORAGE_TYPE=" server/.env 2>/dev/null; then
        # Replace existing configuration
        $SED_CMD "s/SESSION_STORAGE_TYPE=.*/SESSION_STORAGE_TYPE=memory/" server/.env
      else
        # Add new configuration
        cat >> server/.env << EOL

# Session Storage Configuration
SESSION_STORAGE_TYPE=memory
EOL
      fi

      # Set environment variable for Docker Compose
      export SESSION_STORAGE_TYPE="memory"

      echo -e "${GREEN}In-memory storage configuration added to server/.env${NC}"
      return 0
    fi
  fi

  # Check if PostgreSQL configuration exists in server/.env
  PG_CONFIGURED=false
  if [ -f server/.env ] && grep -q "PG_HOST=" server/.env 2>/dev/null; then
    # Only consider it configured if SESSION_STORAGE_TYPE is set to postgresql
    if grep -q "SESSION_STORAGE_TYPE=postgresql" server/.env 2>/dev/null; then
      PG_CONFIGURED=true
      PG_HOST=$(grep "PG_HOST=" server/.env | cut -d= -f2)
      PG_PORT=$(grep "PG_PORT=" server/.env | cut -d= -f2)
      PG_DATABASE=$(grep "PG_DATABASE=" server/.env | cut -d= -f2)
      PG_USER=$(grep "PG_USER=" server/.env | cut -d= -f2)
      PG_PASSWORD=$(grep "PG_PASSWORD=" server/.env | cut -d= -f2)
      PG_SSL=$(grep "PG_SSL=" server/.env | cut -d= -f2)
      PG_DOCKER=$(grep "PG_DOCKER=" server/.env | cut -d= -f2)
      
      echo -e "${YELLOW}Existing PostgreSQL configuration detected:${NC}"
      echo -e "  Host: ${PG_HOST}"
      echo -e "  Port: ${PG_PORT}"
      echo -e "  Database: ${PG_DATABASE}"
      echo -e "  User: ${PG_USER}"
      echo -e "  Docker managed: ${PG_DOCKER}"
    else
      # PostgreSQL settings exist but not active
      echo -e "${YELLOW}Inactive PostgreSQL configuration found.${NC}"
    fi
    
    # If memory storage is explicitly requested, override the existing PostgreSQL configuration
    if [ "$SESSION_STORAGE_TYPE_ARG" = "memory" ]; then
      PG_CONFIGURED=false
      echo -e "${YELLOW}Overriding existing PostgreSQL configuration with memory storage...${NC}"
      
      # Update server/.env file with in-memory configuration
      $SED_CMD "s/SESSION_STORAGE_TYPE=.*/SESSION_STORAGE_TYPE=memory/" server/.env
      
      # Set environment variable for Docker Compose
      export SESSION_STORAGE_TYPE="memory"
      
      echo -e "${GREEN}In-memory storage configuration added to server/.env${NC}"
      return 0
    elif [ "$TEST_MODE" = false ] && [ -z "$SESSION_STORAGE_TYPE_ARG" ] && [ "$PG_CONFIGURED" = true ]; then
      read -p "Do you want to keep this configuration? (y/n): " KEEP_PG_CONFIG
      if [[ $KEEP_PG_CONFIG =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}Keeping existing PostgreSQL configuration.${NC}"
        USE_POSTGRES="y"
      else
        PG_CONFIGURED=false
        echo -e "${YELLOW}Reconfiguring PostgreSQL settings...${NC}"
      fi
    fi
  fi

  if [ "$PG_CONFIGURED" = false ]; then
    # Check if session storage type is provided as an argument
    if [ -n "$SESSION_STORAGE_TYPE_ARG" ]; then
      if [ "$SESSION_STORAGE_TYPE_ARG" = "postgresql" ]; then
        USE_POSTGRES="y"
        echo -e "${YELLOW}Using PostgreSQL for session storage (from argument).${NC}"
      else
        USE_POSTGRES="n"
        echo -e "${YELLOW}Using in-memory session storage (from argument).${NC}"
      fi
    elif [ "$TEST_MODE" = false ]; then
      if [ "$USE_POSTGRES" = true ]; then
        USE_POSTGRES="y"
      else
        read -p "Do you want to use PostgreSQL for session storage? (y/n): " USE_POSTGRES
      fi
    else
      # In test mode, use the test case to determine PostgreSQL usage
      if [[ "$TEST_CASE" == "postgres" || "$TEST_CASE" == "all" ]]; then
        USE_POSTGRES="y"
        echo -e "${YELLOW}Test mode: Using PostgreSQL for session storage.${NC}"
      else
        USE_POSTGRES="n"
        echo -e "${YELLOW}Test mode: Using in-memory session storage.${NC}"
      fi
    fi

    if [[ $USE_POSTGRES =~ ^[Yy]$ ]]; then
      echo -e "${YELLOW}Configuring PostgreSQL session storage...${NC}"
      
      # Check if PostgreSQL location is provided as an argument
      if [ -n "$PG_LOCATION_ARG" ]; then
        PG_LOCATION="$PG_LOCATION_ARG"
      elif [ "$TEST_MODE" = false ]; then
        # Ask if using external or local PostgreSQL
        read -p "Do you want to use an external PostgreSQL server (e) or spin up a local one in Docker (l)? (e/l): " PG_LOCATION
      else
        # In test mode, always use local PostgreSQL
        PG_LOCATION="l"
        echo -e "${YELLOW}Test mode: Using local PostgreSQL in Docker.${NC}"
      fi
      
      if [[ $PG_LOCATION =~ ^[Ee]$ ]]; then
        # External PostgreSQL configuration
        echo -e "${YELLOW}Configuring external PostgreSQL connection...${NC}"
        
        if [ -n "$PG_HOST_ARG" ]; then
          PG_HOST="$PG_HOST_ARG"
        elif [ "$TEST_MODE" = false ]; then
          read -p "Enter PostgreSQL host: " PG_HOST
        else
          # Test mode values for external PostgreSQL
          PG_HOST="localhost"
        fi
        
        if [ -n "$PG_PORT_ARG" ]; then
          PG_PORT="$PG_PORT_ARG"
        elif [ "$TEST_MODE" = false ]; then
          read -p "Enter PostgreSQL port (default: 5432): " PG_PORT
          PG_PORT=${PG_PORT:-5432}
        else
          # Test mode values for external PostgreSQL
          PG_PORT="5432"
        fi
        
        if [ -n "$PG_DATABASE_ARG" ]; then
          PG_DATABASE="$PG_DATABASE_ARG"
        elif [ "$TEST_MODE" = false ]; then
          read -p "Enter PostgreSQL database name: " PG_DATABASE
        else
          # Test mode values for external PostgreSQL
          PG_DATABASE="sharethings_test"
        fi
        
        if [ -n "$PG_USER_ARG" ]; then
          PG_USER="$PG_USER_ARG"
        elif [ "$TEST_MODE" = false ]; then
          read -p "Enter PostgreSQL username: " PG_USER
        else
          # Test mode values for external PostgreSQL
          PG_USER="sharethings_test"
        fi
        
        if [ -n "$PG_PASSWORD_ARG" ]; then
          PG_PASSWORD="$PG_PASSWORD_ARG"
        elif [ "$TEST_MODE" = false ]; then
          read -p "Enter PostgreSQL password: " PG_PASSWORD
        else
          # Test mode values for external PostgreSQL
          PG_PASSWORD="sharethings_test"
        fi
        
        if [ -n "$PG_SSL_ARG" ]; then
          if [ "$PG_SSL_ARG" = true ] || [ "$PG_SSL_ARG" = "y" ]; then
            PG_SSL="true"
          else
            PG_SSL="false"
          fi
        elif [ "$TEST_MODE" = false ]; then
          read -p "Use SSL connection? (y/n, default: n): " PG_SSL_INPUT
          if [[ $PG_SSL_INPUT =~ ^[Yy]$ ]]; then
            PG_SSL="true"
          else
            PG_SSL="false"
          fi
        else
          # Test mode values for external PostgreSQL
          PG_SSL="false"
        fi
        
        # Set flag for Docker Compose
        PG_DOCKER="false"
      else
        # Local PostgreSQL in Docker
        echo -e "${YELLOW}Configuring local PostgreSQL in Docker...${NC}"
        
        # Set default values for local Docker PostgreSQL
        PG_HOST="postgres"  # Use the service name as host
        PG_PORT="5432"
        
        if [ -n "$PG_DATABASE_ARG" ]; then
          PG_DATABASE="$PG_DATABASE_ARG"
        elif [ "$TEST_MODE" = false ]; then
          read -p "Enter PostgreSQL database name (default: sharethings): " PG_DATABASE
          PG_DATABASE=${PG_DATABASE:-sharethings}
        else
          # Test mode values for local PostgreSQL
          PG_DATABASE="sharethings_test"
        fi
        
        if [ -n "$PG_USER_ARG" ]; then
          PG_USER="$PG_USER_ARG"
        elif [ "$TEST_MODE" = false ]; then
          read -p "Enter PostgreSQL username (default: sharethings): " PG_USER
          PG_USER=${PG_USER:-sharethings}
        else
          # Test mode values for local PostgreSQL
          PG_USER="sharethings_test"
        fi
        
        if [ -n "$PG_PASSWORD_ARG" ]; then
          PG_PASSWORD="$PG_PASSWORD_ARG"
        elif [ "$TEST_MODE" = false ]; then
          read -p "Enter PostgreSQL password (default: sharethings): " PG_PASSWORD
          PG_PASSWORD=${PG_PASSWORD:-sharethings}
        else
          # Test mode values for local PostgreSQL
          PG_PASSWORD="sharethings_test"
        fi
        
        # No SSL for local Docker PostgreSQL
        PG_SSL="false"
        
        # Set flag for Docker Compose
        PG_DOCKER="true"
        
        echo -e "${GREEN}Local PostgreSQL will be included in Docker Compose configuration.${NC}"
      fi
      
      # Update server/.env file with PostgreSQL configuration
      if grep -q "SESSION_STORAGE_TYPE=" server/.env 2>/dev/null; then
        # Replace existing configuration
        $SED_CMD "s/SESSION_STORAGE_TYPE=.*/SESSION_STORAGE_TYPE=postgresql/" server/.env
        $SED_CMD "s/PG_HOST=.*/PG_HOST=${PG_HOST}/" server/.env 2>/dev/null || echo "PG_HOST=${PG_HOST}" >> server/.env
        $SED_CMD "s/PG_PORT=.*/PG_PORT=${PG_PORT}/" server/.env 2>/dev/null || echo "PG_PORT=${PG_PORT}" >> server/.env
        $SED_CMD "s/PG_DATABASE=.*/PG_DATABASE=${PG_DATABASE}/" server/.env 2>/dev/null || echo "PG_DATABASE=${PG_DATABASE}" >> server/.env
        $SED_CMD "s/PG_USER=.*/PG_USER=${PG_USER}/" server/.env 2>/dev/null || echo "PG_USER=${PG_USER}" >> server/.env
        $SED_CMD "s/PG_PASSWORD=.*/PG_PASSWORD=${PG_PASSWORD}/" server/.env 2>/dev/null || echo "PG_PASSWORD=${PG_PASSWORD}" >> server/.env
        $SED_CMD "s/PG_SSL=.*/PG_SSL=${PG_SSL}/" server/.env 2>/dev/null || echo "PG_SSL=${PG_SSL}" >> server/.env
        $SED_CMD "s/PG_DOCKER=.*/PG_DOCKER=${PG_DOCKER}/" server/.env 2>/dev/null || echo "PG_DOCKER=${PG_DOCKER}" >> server/.env
      else
        # Add new configuration
        cat >> server/.env << EOL

# PostgreSQL Configuration
SESSION_STORAGE_TYPE=postgresql
PG_HOST=${PG_HOST}
PG_PORT=${PG_PORT}
PG_DATABASE=${PG_DATABASE}
PG_USER=${PG_USER}
PG_PASSWORD=${PG_PASSWORD}
PG_SSL=${PG_SSL}
PG_DOCKER=${PG_DOCKER}
EOL
      fi

      # Set environment variable for Docker Compose
      export SESSION_STORAGE_TYPE="postgresql"
      export PG_HOST="${PG_HOST}"
      export PG_PORT="${PG_PORT}"
      export PG_DATABASE="${PG_DATABASE}"
      export PG_USER="${PG_USER}"
      export PG_PASSWORD="${PG_PASSWORD}"
      export PG_SSL="${PG_SSL}"
      export PG_DOCKER="${PG_DOCKER}"
      export PG_HOST_PORT="5432"

      echo -e "${GREEN}PostgreSQL configuration added to server/.env${NC}"
      
      # Initialize database schema if not in test mode
      if [ "$TEST_MODE" = false ]; then
        initialize_database_schema
      fi
    else
      echo -e "${YELLOW}Using in-memory session storage...${NC}"
      
      # Update server/.env file with in-memory configuration
      if grep -q "SESSION_STORAGE_TYPE=" server/.env 2>/dev/null; then
        # Replace existing configuration
        $SED_CMD "s/SESSION_STORAGE_TYPE=.*/SESSION_STORAGE_TYPE=memory/" server/.env
      else
        # Add new configuration
        cat >> server/.env << EOL

# Session Storage Configuration
SESSION_STORAGE_TYPE=memory
EOL
      fi

      # Set environment variable for Docker Compose
      export SESSION_STORAGE_TYPE="memory"

      echo -e "${GREEN}In-memory storage configuration added to server/.env${NC}"
    fi
  fi
}

# Initialize database schema
initialize_database_schema() {
  if [[ $USE_POSTGRES =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Checking PostgreSQL database schema...${NC}"
    
    # Create a temporary script to check and initialize the database schema
    cat > init-db-schema.js << EOL
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Read configuration from .env file
const envPath = path.join(__dirname, 'server', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// Parse environment variables
const config = {
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true'
};

// Extract values from .env file
envContent.split('\n').forEach(line => {
  const match = line.match(/^PG_([A-Z_]+)=(.*)$/);
  if (match) {
    const key = match[1].toLowerCase();
    const value = match[2];
    
    if (key === 'host') config.host = value;
    else if (key === 'port') config.port = parseInt(value, 10);
    else if (key === 'database') config.database = value;
    else if (key === 'user') config.user = value;
    else if (key === 'password') config.password = value;
    else if (key === 'ssl') config.ssl = value === 'true';
  }
});

// Create a connection pool
const pool = new Pool(config);

async function initializeSchema() {
  const client = await pool.connect();
  
  try {
    console.log('Connected to PostgreSQL database');
    
    // Check if schema_version table exists
    const schemaVersionExists = await client.query(\`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schema_version'
      )
    \`);
    
    let currentVersion = 0;
    
    if (!schemaVersionExists.rows[0].exists) {
      // Create schema_version table
      await client.query(\`
        CREATE TABLE schema_version (
          id SERIAL PRIMARY KEY,
          version INTEGER NOT NULL,
          applied_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      \`);
      
      // Insert initial version
      await client.query(\`
        INSERT INTO schema_version (version) VALUES (0)
      \`);
    } else {
      // Get current schema version
      const versionResult = await client.query(\`
        SELECT version FROM schema_version ORDER BY id DESC LIMIT 1
      \`);
      
      if (versionResult.rows.length > 0) {
        currentVersion = versionResult.rows[0].version;
      }
    }
    
    console.log(\`Current schema version: \${currentVersion}\`);
    
    // Apply migrations based on current version
    if (currentVersion < 1) {
      console.log('Applying migration to version 1: Creating initial tables');
      
      // Create initial tables
      await client.query(\`
        CREATE TABLE IF NOT EXISTS sessions (
          session_id VARCHAR(255) PRIMARY KEY,
          created_at TIMESTAMP NOT NULL,
          last_activity TIMESTAMP NOT NULL,
          fingerprint_iv BYTEA NOT NULL,
          fingerprint_data BYTEA NOT NULL
        )
      \`);
      
      await client.query(\`
        CREATE TABLE IF NOT EXISTS clients (
          client_id VARCHAR(255) PRIMARY KEY,
          session_id VARCHAR(255) NOT NULL,
          client_name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP NOT NULL,
          last_activity TIMESTAMP NOT NULL,
          CONSTRAINT fk_session FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        )
      \`);
      
      await client.query(\`
        CREATE TABLE IF NOT EXISTS session_tokens (
          client_id VARCHAR(255) PRIMARY KEY,
          token VARCHAR(255) NOT NULL,
          created_at TIMESTAMP NOT NULL,
          CONSTRAINT fk_client FOREIGN KEY(client_id) REFERENCES clients(client_id) ON DELETE CASCADE
        )
      \`);
      
      // Update schema version
      await client.query(\`
        INSERT INTO schema_version (version) VALUES (1)
      \`);
      
      console.log('Migration to version 1 complete');
    }
    
    console.log('Database schema initialization complete');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initializeSchema();
EOL

    # Install pg module if needed
    if ! [ -d "node_modules/pg" ]; then
      echo -e "${YELLOW}Installing PostgreSQL client module...${NC}"
      npm install --no-save pg
    fi
    
    # Run the schema initialization script
    echo -e "${YELLOW}Initializing database schema...${NC}"
    node init-db-schema.js
    
    # Clean up the temporary script
    rm init-db-schema.js
  fi
}