# Dockerfile
FROM python:3.11-slim

# Create a system user to avoid running as root
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Install dependencies first (caches this layer to speed up future builds)
COPY --chown=appuser:appuser requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY --chown=appuser:appuser . .

# Switch to the non-root user
USER appuser

# Command to run the web server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
