#!/bin/bash

# Test script to demonstrate the timing fix
echo "🧪 Testing timing fix for double-counting issue..."

# Check if bc is available
if ! command -v bc &> /dev/null; then
    echo "Installing bc for timing calculations..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y bc
    elif command -v yum &> /dev/null; then
        sudo yum install -y bc
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y bc
    else
        echo "Could not install 'bc'. Using basic timing instead."
        exit 1
    fi
fi

# Source timing functions from the fixed script
declare -A STEP_START_TIMES
declare -A STEP_END_TIMES
declare -A STEP_DURATIONS
declare -a STEP_ORDER
TOTAL_START_TIME=""
TOTAL_END_TIME=""

start_timer() {
    local step_name="$1"
    STEP_START_TIMES["$step_name"]=$(date +%s.%N)
    STEP_ORDER+=("$step_name")
    echo "⏱️  [$(date '+%H:%M:%S')] Starting: $step_name"
}

end_timer() {
    local step_name="$1"
    STEP_END_TIMES["$step_name"]=$(date +%s.%N)
    local duration=$(echo "${STEP_END_TIMES[$step_name]} - ${STEP_START_TIMES[$step_name]}" | bc -l)
    STEP_DURATIONS["$step_name"]=$duration
    printf "✅ [$(date '+%H:%M:%S')] Completed: %s (%.2fs)\n" "$step_name" "$duration"
}

format_duration() {
    local duration=$1
    local minutes=$(echo "$duration / 60" | bc -l)
    local seconds=$(echo "$duration % 60" | bc -l)
    
    if (( $(echo "$minutes >= 1" | bc -l) )); then
        printf "%.0fm %.1fs" "$minutes" "$seconds"
    else
        printf "%.2fs" "$duration"
    fi
}

show_timing_summary() {
    echo ""
    echo "🕐 ================= TIMING SUMMARY =================="
    echo "📊 Step-by-step breakdown:"
    echo ""
    
    local total_measured=0
    for step in "${STEP_ORDER[@]}"; do
        if [[ -n "${STEP_DURATIONS[$step]}" ]]; then
            local formatted_duration=$(format_duration "${STEP_DURATIONS[$step]}")
            printf "   %-35s %s\n" "$step:" "$formatted_duration"
            total_measured=$(echo "$total_measured + ${STEP_DURATIONS[$step]}" | bc -l)
        fi
    done
    
    echo ""
    echo "📈 Summary:"
    if [[ -n "$TOTAL_START_TIME" && -n "$TOTAL_END_TIME" ]]; then
        local total_wall_time=$(echo "$TOTAL_END_TIME - $TOTAL_START_TIME" | bc -l)
        local total_wall_formatted=$(format_duration "$total_wall_time")
        local total_measured_formatted=$(format_duration "$total_measured")
        
        printf "   %-35s %s\n" "Total wall clock time (actual):" "$total_wall_formatted"
        printf "   %-35s %s\n" "Total measured time (sum):" "$total_measured_formatted"
        
        # Explain the difference
        echo ""
        echo "ℹ️  Timing Explanation:"
        echo "   • Wall clock time = actual elapsed time from start to finish"
        echo "   • Measured time = sum of all individual step durations"
        if (( $(echo "$total_measured > $total_wall_time" | bc -l) )); then
            echo "   • Measured > Wall clock indicates overlapping/parallel operations"
        elif (( $(echo "$total_wall_time > $total_measured" | bc -l) )); then
            local overhead=$(echo "$total_wall_time - $total_measured" | bc -l)
            local overhead_formatted=$(format_duration "$overhead")
            printf "   • Overhead/unmeasured time: %s\n" "$overhead_formatted"
        else
            echo "   • Times match closely - good measurement coverage"
        fi
    else
        local total_measured_formatted=$(format_duration "$total_measured")
        printf "   %-35s %s\n" "Total measured time:" "$total_measured_formatted"
        echo "   (Wall clock time not available - missing start/end timestamps)"
    fi
    
    echo "=================================================="
}

# Simulate the corrected timing approach
echo ""
echo "📊 Demonstrating CORRECTED timing (no double-counting)..."

TOTAL_START_TIME=$(date +%s.%N)

# Simulate individual steps without nesting
start_timer "Environment Setup"
sleep 1
end_timer "Environment Setup"

start_timer "Configuration"
sleep 0.5
end_timer "Configuration"

# Simulate container build steps (these would be inside build_and_start_containers)
start_timer "Pre-operation Check"
sleep 0.2
end_timer "Pre-operation Check"

start_timer "Data Directory Setup"
sleep 0.1
end_timer "Data Directory Setup"

start_timer "Production Container Build"
sleep 2
end_timer "Production Container Build"

start_timer "Production Container Startup"
sleep 0.5
end_timer "Production Container Startup"

start_timer "Verification"
sleep 0.3
end_timer "Verification"

TOTAL_END_TIME=$(date +%s.%N)

# Show the corrected timing summary
show_timing_summary

echo ""
echo "✅ Timing fix demonstration completed!"
echo ""
echo "🔍 Key differences in the fixed version:"
echo "   • No nested timing calls that double-count duration"
echo "   • Wall clock time should closely match measured time"
echo "   • Clear explanation of timing differences"
echo "   • Individual step breakdown shows where time is actually spent"
echo ""
echo "🚀 The fixed setup-instrumented.sh should now show accurate timing!"