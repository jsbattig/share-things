#!/bin/bash

# Simple test script to demonstrate the timing instrumentation
# This simulates some of the setup steps without actually running them

echo "🧪 Testing timing instrumentation..."

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
        # Fallback timing without bc
        start_timer() {
            echo "⏱️  [$(date '+%H:%M:%S')] Starting: $1"
        }
        end_timer() {
            echo "✅ [$(date '+%H:%M:%S')] Completed: $1"
        }
        show_timing_summary() {
            echo "📊 Basic timing summary (bc not available for precise calculations)"
        }
    fi
fi

# Source the timing functions from the instrumented script if bc is available
if command -v bc &> /dev/null; then
    # Extract timing functions from the instrumented script
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
            
            printf "   %-35s %s\n" "Total measured time:" "$total_measured_formatted"
            printf "   %-35s %s\n" "Total wall clock time:" "$total_wall_formatted"
        else
            local total_measured_formatted=$(format_duration "$total_measured")
            printf "   %-35s %s\n" "Total measured time:" "$total_measured_formatted"
        fi
        
        echo ""
        echo "🔍 Performance insights:"
        
        # Find slowest step
        local slowest_step=""
        local slowest_duration=0
        for step in "${STEP_ORDER[@]}"; do
            if [[ -n "${STEP_DURATIONS[$step]}" ]]; then
                if (( $(echo "${STEP_DURATIONS[$step]} > $slowest_duration" | bc -l) )); then
                    slowest_duration=${STEP_DURATIONS[$step]}
                    slowest_step=$step
                fi
            fi
        done
        
        if [[ -n "$slowest_step" ]]; then
            local slowest_formatted=$(format_duration "$slowest_duration")
            echo "   🐌 Slowest step: $slowest_step ($slowest_formatted)"
            
            if (( $(echo "$total_measured > 0" | bc -l) )); then
                local percentage=$(echo "scale=1; $slowest_duration * 100 / $total_measured" | bc -l)
                echo "      (${percentage}% of total measured time)"
            fi
        fi
        
        echo "=================================================="
    }
fi

# Test the timing functions
echo ""
echo "📊 Simulating setup steps with timing..."

TOTAL_START_TIME=$(date +%s.%N)

start_timer "Environment Setup"
sleep 2
end_timer "Environment Setup"

start_timer "Configuration"
sleep 1.5
end_timer "Configuration"

start_timer "Container Build (Simulated)"
sleep 3
end_timer "Container Build (Simulated)"

start_timer "Container Startup"
sleep 1
end_timer "Container Startup"

start_timer "Verification"
sleep 0.5
end_timer "Verification"

TOTAL_END_TIME=$(date +%s.%N)

# Show the timing summary
show_timing_summary

echo ""
echo "✅ Timing instrumentation test completed!"
echo ""
echo "🚀 To use the instrumented setup script:"
echo "   ./setup-instrumented.sh --non-interactive --force-install"
echo ""
echo "📋 The instrumented script provides:"
echo "   • Step-by-step timing breakdown"
echo "   • Performance insights and bottleneck identification"
echo "   • Build vs. configuration time analysis"
echo "   • Retry detection and monitoring"